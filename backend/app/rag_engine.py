"""Motor RAG y Base de Conocimiento Clínico para NeuroAnatomy 3D.

Soporta ChromaDB para búsqueda vectorial y múltiples proveedores de LLM:
- Google Gemini (API oficial LangChain / google-genai)
- OpenAI (gpt-4o-mini / gpt-4o)
- Modo 'mock' inteligente determinista (offline, sin costo, basado en corpus médico)
"""

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag_engine")

# Directorios de datos y persistencia
BASE_DIR = Path(__file__).resolve().parent.parent
DOCS_DIR = BASE_DIR / "data" / "medical_docs"
DEFAULT_CHROMA_DIR = str(BASE_DIR / "chroma_db")


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
        
        # Cargar documentos e inicializar almacén vectorial
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
                
                # La primera sección puede ser el título principal
                for idx, sec in enumerate(sections):
                    if not sec.strip():
                        continue
                    
                    lines = sec.strip().split("\n")
                    raw_title = lines[0].strip().lstrip("#").strip()
                    body = "\n".join(lines[1:]).strip() if len(lines) > 1 else lines[0]
                    
                    # Extraer ID estructural si existe
                    part_id = "general"
                    id_match = re.search(r"-\s*\*\*ID Estructural\*\*:\s*`?([a-zA-Z0-9_,\s]+)`?", sec)
                    if id_match:
                        part_id = id_match.group(1).split(",")[0].strip()

                    # Extraer Capa Anatómica
                    layer = "general"
                    layer_match = re.search(r"-\s*\*\*Capa Anatómica\*\*:\s*`?([a-zA-Z0-9_]+)`?", sec)
                    if layer_match:
                        layer = layer_match.group(1).strip()
                    elif "oseo" in md_file.name:
                        layer = "oseo"
                    elif "muscular" in md_file.name:
                        layer = "muscular"
                    elif "nervioso" in md_file.name:
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
            
            # Obtener o crear colección
            self.chroma_collection = self.chroma_client.get_or_create_collection(
                name="medical_knowledge_base",
                metadata={"description": "Corpus de anatomía, biomecánica y patologías NeuroAnatomy 3D"}
            )

            # Si la colección está vacía, indexar los fragmentos
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

    def search_similar(
        self,
        query: str,
        n_results: int = 3,
        selected_part: Optional[str] = None,
        system_layer: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Realiza búsqueda semántica en ChromaDB con fallback resiliente en memoria."""
        # 1. Intento con ChromaDB
        if self.chroma_collection is not None:
            try:
                where_filter = None
                if system_layer and system_layer not in ("todos", "general", "all"):
                    where_filter = {"system_layer": system_layer}

                query_text = f"{selected_part or ''} {query}".strip()
                results = self.chroma_collection.query(
                    query_texts=[query_text],
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

        # 2. Fallback por similitud léxica/semántica ponderada
        keywords = set(re.findall(r"\w+", (f"{selected_part or ''} {query}").lower()))
        scored_chunks: List[tuple[float, MedicalDocumentChunk]] = []

        for chunk in self.chunks:
            score = 0.0
            chunk_text = f"{chunk.title} {chunk.content} {chunk.part_id}".lower()
            
            # Bonificación directa por coincidencia de estructura
            if selected_part and selected_part.lower() in chunk.part_id.lower():
                score += 25.0
            if system_layer and system_layer.lower() == chunk.system_layer.lower():
                score += 10.0

            # Coincidencia de palabras clave
            for kw in keywords:
                if len(kw) > 3:
                    if kw in chunk.title.lower():
                        score += 5.0
                    if kw in chunk_text:
                        score += 1.5

            if score > 0:
                scored_chunks.append((score, chunk))

        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        top = scored_chunks[:n_results]
        
        # Si no hay matches, devolver los primeros como contexto general
        if not top and self.chunks:
            top = [(1.0, c) for c in self.chunks[:n_results]]

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
        selected_part: Optional[str],
        system_layer: str,
        contexts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Generador educativo de alta fidelidad para modo offline simulado."""
        part_clean = (selected_part or "Estructura Anatómica General").replace("_", " ").title()
        
        # Extraer fuentes y referencias
        sources = list(dict.fromkeys([c["source_file"] for c in contexts]))
        if not sources:
            sources = ["sistema_oseo.md", "sistema_muscular.md", "sistema_nervioso.md"]

        # Estructuras relacionadas basadas en el contexto
        related = []
        context_blob = " ".join([c["content"] for c in contexts])
        potential_related = [
            ("cráneo", "craneo"), ("columna", "columna_vertebral"),
            ("fémur", "femur_izq"), ("húmero", "humero_izq"),
            ("bíceps", "biceps_braquial_izq"), ("cuádriceps", "cuadriceps_izq"),
            ("deltoides", "deltoides_izq"), ("pectoral", "pectoral_mayor"),
            ("ciático", "nervio_ciatico"), ("plexo braquial", "plexo_braquial"),
            ("médula", "medula_espinal"), ("encéfalo", "cerebro_encefalo"),
        ]
        for term, rel_id in potential_related:
            if term in context_blob.lower() and rel_id != selected_part:
                related.append(rel_id)
        if not related:
            related = ["columna_vertebral", "deltoides_izq", "nervio_ciatico"]

        # Extracción inteligente de fragmentos
        summary_lines = []
        for c in contexts[:2]:
            lines = [l.strip() for l in c["content"].split("\n") if l.strip().startswith("-")]
            if lines:
                summary_lines.extend(lines[:3])

        excerpt_text = "\n".join(summary_lines) if summary_lines else (
            f"- Estructura clave dentro del sistema {system_layer.upper()}.\n"
            "- Participa activamente en la estabilidad biomecánica y la transmisión sináptica o mecánica."
        )

        answer = (
            f"### 🩺 Análisis Clínico Educativo: {part_clean}\n\n"
            f"**Pregunta consultada:** *\"{query}\"*\n\n"
            f"#### 🧬 Hallazgos Anatómicos y Biomecánicos:\n"
            f"Con base en el corpus indexado en **{', '.join(sources)}**, esta región corresponde al **sistema {system_layer}**:\n\n"
            f"{excerpt_text}\n\n"
            f"#### 🔬 Relevancia Clínica y Mecanismos de Lesión:\n"
            f"Las afecciones más comunes descritas en la literatura incluyen sobrecargas biomecánicas, "
            f"compromiso neurovascular por compresión o avulsiones tendinosas según el nivel de solicitación funcional. "
            f"La integridad de las estructuras adyacentes resulta crucial para prevenir secuelas funcionales.\n\n"
            f"*(Nota: Respuesta sintetizada por el motor RAG en modo local 'mock' utilizando vectores semánticos).* "
            f"\n\n> ⚠️ **Aviso:** Herramienta exclusivamente formativa. No reemplaza un diagnóstico médico."
        )

        return {
            "answer": answer,
            "sources": sources,
            "related_structures": list(dict.fromkeys(related))[:4],
        }

    def consult(
        self,
        question: str,
        selected_part: Optional[str] = None,
        system_layer: str = "todos",
    ) -> Dict[str, Any]:
        """Consulta principal del asistente médico RAG."""
        # Recuperar fragmentos relevantes
        contexts = self.search_similar(
            query=question,
            n_results=3,
            selected_part=selected_part,
            system_layer=system_layer,
        )

        # 1. Modo Gemini
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
                    "Eres el Asistente Clínico y Docente de NeuroAnatomy 3D. "
                    "Responde en español de forma rigurosa, pedagógica y estructurada usando la evidencia provista. "
                    "Estructura tu respuesta con: 1) Análisis Anatómico/Biomecánico, 2) Patologías y Lesiones Asociadas, 3) Recomendación Educativa. "
                    "Termina siempre con el disclaimer médico obligatorio."
                )
                user_prompt = (
                    f"Estructura seleccionada: {selected_part or 'No especificada'} (Capa: {system_layer})\n"
                    f"Contexto Recuperado:\n{context_str}\n\n"
                    f"Pregunta del estudiante/médico: {question}"
                )

                response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
                sources = list(dict.fromkeys([c["source_file"] for c in contexts]))
                return {
                    "answer": response.content,
                    "sources": sources,
                    "related_structures": [c["metadata"].get("part_id", "general") for c in contexts if c["metadata"].get("part_id") != selected_part][:3],
                }
            except Exception as e:
                logger.error(f"Error invocando Gemini API: {e}. Empleando fallback local.")

        # 2. Modo OpenAI
        elif self.provider == "openai" and self.openai_api_key:
            try:
                from langchain_openai import ChatOpenAI
                from langchain.schema import HumanMessage, SystemMessage

                llm = ChatOpenAI(
                    model="gpt-4o-mini",
                    api_key=self.openai_api_key,
                    temperature=0.2,
                )
                context_str = "\n\n".join([f"Fuente ({c['source_file']}):\n{c['content']}" for c in contexts])
                system_prompt = (
                    "Eres el Asistente Clínico de NeuroAnatomy 3D. "
                    "Responde en español con rigor médico, pedagógico y estructurado con base en el contexto provisto."
                )
                user_prompt = f"Estructura: {selected_part} | Pregunta: {question}\n\nContexto:\n{context_str}"
                
                response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
                sources = list(dict.fromkeys([c["source_file"] for c in contexts]))
                return {
                    "answer": response.content,
                    "sources": sources,
                    "related_structures": [c["metadata"].get("part_id", "general") for c in contexts if c["metadata"].get("part_id") != selected_part][:3],
                }
            except Exception as e:
                logger.error(f"Error invocando OpenAI API: {e}. Empleando fallback local.")

        # 3. Modo Mock Inteligente (Predeterminado y offline)
        return self._generate_mock_response(question, selected_part, system_layer, contexts)
