"""Motor RAG y Base de Conocimiento Clínico para NeuroAnatomy 3D.

Soporta ChromaDB para búsqueda vectorial y múltiples proveedores de LLM:
- Google Gemini (API oficial LangChain / google-genai)
- OpenAI (gpt-4o-mini / gpt-4o)
- Modo 'mock' inteligente determinista (offline, sin costo, basado en corpus médico)
"""

import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag_engine")

BASE_DIR = Path(__file__).resolve().parent.parent
DOCS_DIR = BASE_DIR / "data" / "medical_docs"
DEFAULT_CHROMA_DIR = str(BASE_DIR / "chroma_db")


def normalize_text(text: str) -> str:
    """Normaliza texto eliminando diacríticos/acentos y pasando a minúsculas."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    clean = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return clean.lower().strip()


class MedicalDocumentChunk:
    """Representación de un fragmento de conocimiento médico."""

    def __init__(
        self,
        doc_id: str,
        title: str,
        system_layer: str,
        part_id: str,
        content: str,
        source_file: str,
    ):
        self.doc_id = doc_id
        self.title = title
        self.system_layer = system_layer
        self.part_id = part_id
        self.content = content
        self.source_file = source_file

    def to_metadata(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "system_layer": self.system_layer,
            "part_id": self.part_id,
            "source_file": self.source_file,
        }


class MedicalRAGEngine:
    """Motor de Ingesta, Búsqueda Semántica y Generación RAG."""

    def __init__(
        self,
        provider: str = "mock",
        chroma_dir: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
    ):
        self.provider = (provider or os.getenv("LLM_PROVIDER", "mock")).lower()
        self.chroma_dir = chroma_dir or os.getenv("CHROMA_PERSIST_DIR", DEFAULT_CHROMA_DIR)
        self.gemini_api_key = gemini_api_key or os.getenv("GEMINI_API_KEY", "")
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY", "")

        self.chunks: List[MedicalDocumentChunk] = []
        self.chroma_collection = None
        self.chroma_client = None

        self._load_corpus_from_disk()
        self._init_vector_store()

    def _load_corpus_from_disk(self) -> None:
        """Carga y segmenta los archivos Markdown del corpus médico."""
        self.chunks.clear()
        if not DOCS_DIR.exists():
            logger.warning(f"Directorio de documentos médicos no encontrado: {DOCS_DIR}")
            return

        for md_file in sorted(DOCS_DIR.glob("*.md")):
            try:
                text = md_file.read_text(encoding="utf-8")
                sections = re.split(r"\n##\s+", text)

                for idx, sec in enumerate(sections):
                    if not sec.strip():
                        continue

                    lines = sec.strip().split("\n")
                    raw_title = lines[0].strip().lstrip("#").strip()
                    body = "\n".join(lines[1:]).strip() if len(lines) > 1 else lines[0]

                    part_id = "general"
                    id_match = re.search(r"-\s*\*\*ID Estructural\*\*:\s*`?([a-zA-Z0-9_,\s]+)`?", sec)
                    if id_match:
                        part_id = id_match.group(1).split(",")[0].strip()

                    layer = "general"
                    layer_match = re.search(r"-\s*\*\*Capa Anatómica\*\*:\s*`?([a-zA-Z0-9_]+)`?", sec)
                    if layer_match:
                        layer = layer_match.group(1).strip()
                    elif "oseo" in md_file.name or "hueso" in normalize_text(raw_title):
                        layer = "oseo"
                    elif "muscular" in md_file.name or "musculo" in normalize_text(raw_title):
                        layer = "muscular"
                    elif "nervioso" in md_file.name or "nervio" in normalize_text(raw_title):
                        layer = "nervioso"

                    chunk_id = f"{md_file.stem}_{idx}_{part_id}"
                    full_content = f"### {raw_title}\n{body}"

                    chunk = MedicalDocumentChunk(
                        doc_id=chunk_id,
                        title=raw_title,
                        system_layer=layer,
                        part_id=part_id,
                        content=full_content,
                        source_file=md_file.name,
                    )
                    self.chunks.append(chunk)

            except Exception as e:
                logger.error(f"Error procesando archivo médico {md_file.name}: {e}")

        logger.info(f"Cargados {len(self.chunks)} fragmentos anatómicos desde {DOCS_DIR}")

    def _init_vector_store(self) -> None:
        """Inicializa ChromaDB y vectoriza los fragmentos."""
        try:
            import chromadb
            from chromadb.config import Settings

            os.makedirs(self.chroma_dir, exist_ok=True)
            self.chroma_client = chromadb.PersistentClient(
                path=self.chroma_dir,
                settings=Settings(anonymized_telemetry=False)
            )

            self.chroma_collection = self.chroma_client.get_or_create_collection(
                name="medical_knowledge_base",
                metadata={"description": "Corpus de anatomía, biomecánica y patologías NeuroAnatomy 3D"}
            )

            current_count = self.chroma_collection.count()
            if current_count == 0 and self.chunks:
                logger.info("Indexando fragmentos médicos en ChromaDB...")
                ids = [c.doc_id for c in self.chunks]
                documents = [c.content for c in self.chunks]
                metadatas = [c.to_metadata() for c in self.chunks]

                self.chroma_collection.add(
                    ids=ids,
                    documents=documents,
                    metadatas=metadatas,
                )
                logger.info(f"ChromaDB indexado exitosamente con {len(ids)} documentos.")
            else:
                logger.info(f"Colección ChromaDB existente con {current_count} vectores.")

        except Exception as e:
            logger.warning(f"No se pudo inicializar ChromaDB ({e}). Se usará motor semántico en memoria.")
            self.chroma_collection = None

    def _detect_query_intent(self, query: str, selected_part: Optional[str]) -> tuple[str, str, Optional[str]]:
        """Identifica el tema exacto que el usuario está preguntando."""
        q = normalize_text(query)

        general_topics = [
            (
                ("que es el hueso", "que son los huesos", "tejido oseo", "definicion de hueso", "hueso general"),
                ("El Hueso y el Tejido Óseo", "oseo", "hueso_general"),
            ),
            (
                ("que es el musculo", "que son los musculos", "tejido muscular", "definicion de musculo", "musculo general"),
                ("El Músculo y el Tejido Muscular", "muscular", "musculo_general"),
            ),
            (
                ("sistema nervioso", "que es una neurona", "tejido nervioso", "la neurona", "las neuronas"),
                ("El Sistema Nervioso y la Neurona", "nervioso", "sistema_nervioso_general"),
            ),
        ]
        for patterns, result in general_topics:
            if any(pattern in q for pattern in patterns):
                return result

        anatomy_keywords = {
            "nervio ciatico": ("Nervio Ciático (Isquiático)", "nervioso", "nervio_ciatico"),
            "plexo braquial": ("Plexo Braquial", "nervioso", "plexo_braquial"),
            "columna vertebral": ("Columna Vertebral y Canal Raquídeo", "oseo", "columna_vertebral"),
            "canal raquideo": ("Columna Vertebral y Canal Raquídeo", "oseo", "columna_vertebral"),
            "torax costillas": ("Tórax Óseo y Costillas", "oseo", "torax_costillas"),
            "craneo": ("Cráneo y Macizo Facial", "oseo", "craneo"),
            "cabeza": ("Cráneo y Macizo Facial", "oseo", "craneo"),
            "mandibula": ("Mandíbula", "oseo", "craneo"),
            "vertebra": ("Columna Vertebral y Vértebras", "oseo", "columna_vertebral"),
            "torax": ("Tórax Óseo y Costillas", "oseo", "torax_costillas"),
            "costilla": ("Costillas y Tórax", "oseo", "torax_costillas"),
            "humero": ("Húmero", "oseo", "humero_izq"),
            "brazo": ("Húmero y Miembro Superior", "oseo", "humero_izq"),
            "femur": ("Fémur", "oseo", "femur_izq"),
            "pierna": ("Fémur y Miembro Inferior", "oseo", "femur_izq"),
            "biceps": ("Músculo Bíceps Braquial", "muscular", "biceps_braquial_izq"),
            "cuadriceps": ("Músculo Cuádriceps Femoral", "muscular", "cuadriceps_izq"),
            "deltoides": ("Músculo Deltoides", "muscular", "deltoides_izq"),
            "hombro": ("Músculo Deltoides y Hombro", "muscular", "deltoides_izq"),
            "pectoral": ("Músculo Pectoral Mayor", "muscular", "pectoral_mayor"),
            "abdomen": ("Músculos Abdominales y Recto", "muscular", "abdominales_recto"),
            "cerebro": ("Encéfalo y Hemisferios Cerebrales", "nervioso", "cerebro_encefalo"),
            "encefalo": ("Encéfalo y Hemisferios Cerebrales", "nervioso", "cerebro_encefalo"),
            "medula": ("Médula Espinal", "nervioso", "medula_espinal"),
            "ciatico": ("Nervio Ciático (Isquiático)", "nervioso", "nervio_ciatico"),
            "plexo": ("Plexo Braquial", "nervioso", "plexo_braquial"),
        }
        ordered_keywords = sorted(anatomy_keywords, key=len, reverse=True)
        for kw in ordered_keywords:
            if kw in q:
                return anatomy_keywords[kw]

        if selected_part:
            norm_part = normalize_text(selected_part)
            selected_chunk = next(
                (c for c in self.chunks if normalize_text(c.part_id) == norm_part),
                None,
            )
            if selected_chunk:
                return (selected_chunk.title, selected_chunk.system_layer, selected_part)
            for kw in ordered_keywords:
                if kw in norm_part:
                    return anatomy_keywords[kw]
            return (selected_part.replace("_", " ").title(), "auto", selected_part)

        return ("Anatomía Humana", "general", None)

    def search_similar(
        self,
        query: str,
        n_results: int = 3,
        target_part_id: Optional[str] = None,
        system_layer: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Realiza búsqueda semántica en ChromaDB o en memoria."""
        where_clauses: List[Dict[str, Any]] = []
        if system_layer and system_layer not in ("todos", "general", "all", "auto"):
            where_clauses.append({"system_layer": system_layer})
        if target_part_id and target_part_id not in ("general", "all"):
            where_clauses.append({"part_id": target_part_id})

        where_filter: Optional[Dict[str, Any]] = None
        if len(where_clauses) == 1:
            where_filter = where_clauses[0]
        elif where_clauses:
            where_filter = {"$and": where_clauses}

        if self.chroma_collection is not None:
            try:
                results = self.chroma_collection.query(
                    query_texts=[query.strip()],
                    n_results=min(n_results, max(1, self.chroma_collection.count())),
                    where=where_filter,
                )

                extracted: List[Dict[str, Any]] = []
                if results and "documents" in results and results["documents"]:
                    docs = results["documents"][0]
                    metas = results["metadatas"][0] if "metadatas" in results else [{}] * len(docs)
                    for doc, meta in zip(docs, metas):
                        extracted.append({
                            "content": doc,
                            "metadata": meta,
                            "source_file": meta.get("source_file", "medical_corpus.md"),
                            "title": meta.get("title", "Anatomía"),
                        })
                if extracted:
                    return extracted
            except Exception as e:
                logger.warning(f"Error consultando ChromaDB: {e}. Pasando a búsqueda en memoria.")

        target_norm = normalize_text(target_part_id) if target_part_id else ""
        pool = (
            [c for c in self.chunks if normalize_text(c.part_id) == target_norm]
            if target_norm and target_norm not in ("general", "all")
            else list(self.chunks)
        ) or list(self.chunks)

        layer_norm = normalize_text(system_layer) if system_layer else ""
        keywords = {kw for kw in re.findall(r"\w+", normalize_text(query)) if len(kw) > 3}
        scored_chunks: List[tuple[float, MedicalDocumentChunk]] = []

        for chunk in pool:
            score = 0.0
            title_norm = normalize_text(chunk.title)
            content_norm = normalize_text(chunk.content)

            if layer_norm in ("oseo", "muscular", "nervioso") and normalize_text(chunk.system_layer) == layer_norm:
                score += 15.0

            for kw in keywords:
                if kw in title_norm:
                    score += 10.0
                if kw in content_norm:
                    score += 2.0

            if score > 0:
                scored_chunks.append((score, chunk))

        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        top = scored_chunks[:n_results] or [(1.0, c) for c in pool[:n_results]]

        return [
            {
                "content": c.content,
                "metadata": c.to_metadata(),
                "source_file": c.source_file,
                "title": c.title,
            }
            for _, c in top
        ]

    def _generate_mock_response(
        self,
        query: str,
        topic_name: str,
        topic_layer: str,
        contexts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Genera una respuesta puntual usando únicamente el fragmento relevante."""
        if not contexts:
            return {
                "answer": f"No encontré información específica sobre **{topic_name}** en la base de conocimiento.",
                "sources": [],
                "related_structures": [],
            }

        primary = contexts[0]
        body = re.sub(r"^###\s+.*\n", "", primary["content"], count=1).strip()
        body = "\n".join(
            line for line in body.splitlines()
            if not re.match(r"^-\s+\*\*(ID Estructural|Capa Anatómica)\*\*:", line)
        ).strip()
        source = primary.get("source_file", "")
        part_id = (primary.get("metadata") or {}).get("part_id", "general")

        answer = (
            f"### {topic_name}\n\n"
            f"{body}\n\n"
            f"> ⚠️ **Recordatorio educativo:** información pedagógica; no sustituye la consulta médica."
        )

        return {
            "answer": answer,
            "sources": [source] if source else [],
            "related_structures": [part_id] if part_id and part_id != "general" else [],
        }

    def consult(
        self,
        question: str,
        selected_part: Optional[str] = None,
        system_layer: str = "todos",
    ) -> Dict[str, Any]:
        """Consulta principal del asistente médico RAG."""
        topic_name, topic_layer, target_id = self._detect_query_intent(question, selected_part)
        effective_layer = topic_layer if topic_layer != "auto" else system_layer

        contexts = self.search_similar(
            query=question,
            n_results=3,
            target_part_id=target_id,
            system_layer=effective_layer,
        )

        if self.provider == "gemini" and self.gemini_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                from langchain.schema import HumanMessage, SystemMessage

                llm = ChatGoogleGenerativeAI(
                    model="gemini-1.5-flash",
                    google_api_key=self.gemini_api_key,
                    temperature=0.2,
                )

                context_str = "\n\n".join([f"Fuente ({c['source_file']}):\n{c['content']}" for c in contexts])
                system_prompt = (
                    "Responde SOLO sobre la estructura anatómica preguntada. "
                    "Usa exclusivamente la información dentro de <contexto> y </contexto>. "
                    "No menciones otras estructuras, no hagas comparaciones y no agregues temas no preguntados. "
                    "Sé breve, directo y pedagógico. Termina con un aviso educativo breve."
                )
                user_prompt = f"<pregunta>{question}</pregunta>\n<contexto>{context_str}</contexto>"

                response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
                sources = list(dict.fromkeys([c["source_file"] for c in contexts]))
                related = list(dict.fromkeys([
                    c["metadata"].get("part_id", "general")
                    for c in contexts
                    if c["metadata"].get("part_id")
                ]))
                return {
                    "answer": response.content,
                    "sources": sources,
                    "related_structures": related[:3],
                }
            except Exception as e:
                logger.error(f"Error invocando Gemini API: {e}. Empleando fallback local.")

        elif self.provider == "openai" and self.openai_api_key:
            try:
                from langchain_openai import ChatOpenAI
                from langchain.schema import HumanMessage, SystemMessage

                llm = ChatOpenAI(model="gpt-4o-mini", api_key=self.openai_api_key, temperature=0.2)
                context_str = "\n\n".join([f"Fuente ({c['source_file']}):\n{c['content']}" for c in contexts])
                system_prompt = (
                    "Responde SOLO sobre la estructura anatómica preguntada. "
                    "Usa exclusivamente la información dentro de <contexto> y </contexto>. "
                    "No menciones otras estructuras, no hagas comparaciones y no agregues temas no preguntados. "
                    "Sé breve, directo y pedagógico. Termina con un aviso educativo breve."
                )
                user_prompt = f"<pregunta>{question}</pregunta>\n<contexto>{context_str}</contexto>"
                response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
                sources = list(dict.fromkeys([c["source_file"] for c in contexts]))
                related = list(dict.fromkeys([
                    c["metadata"].get("part_id", "general")
                    for c in contexts
                    if c["metadata"].get("part_id")
                ]))
                return {
                    "answer": response.content,
                    "sources": sources,
                    "related_structures": related[:3],
                }
            except Exception as e:
                logger.error(f"Error invocando OpenAI API: {e}. Empleando fallback local.")

        return self._generate_mock_response(question, topic_name, effective_layer, contexts)
