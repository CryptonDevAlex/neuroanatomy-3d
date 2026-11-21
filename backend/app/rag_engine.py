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

        # 1. Conceptos fundamentales universales
        if any(term in q for term in ["que es el hueso", "que son los huesos", "tejido oseo", "el hueso", "los huesos"]):
            return ("El Hueso y el Tejido Óseo", "oseo", "hueso_general")

        if any(term in q for term in ["que es el musculo", "que son los musculos", "tejido muscular", "el musculo", "los musculos"]):
            return ("El Músculo y el Tejido Muscular", "muscular", "musculo_general")

        if any(term in q for term in ["sistema nervioso", "que es una neurona", "la neurona", "las neuronas", "el nervio", "nervios"]):
            return ("El Sistema Nervioso y la Neurona", "nervioso", "sistema_nervioso_general")

        # 2. Órganos y estructuras específicas en la pregunta
        anatomy_keywords = {
            "craneo": ("Cráneo y Macizo Facial", "oseo", "craneo"),
            "cabeza": ("Cráneo y Macizo Facial", "oseo", "craneo"),
            "mandibula": ("Mandíbula", "oseo", "craneo"),
            "columna": ("Columna Vertebral y Canal Raquídeo", "oseo", "columna_vertebral"),
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

        for kw, (name, layer, target_id) in anatomy_keywords.items():
            if kw in q:
                return (name, layer, target_id)

        # 3. Preguntas deícticas asociadas a la selección del modelo 3D
        if selected_part:
            norm_part = normalize_text(selected_part)
            for kw, (name, layer, target_id) in anatomy_keywords.items():
                if kw in norm_part:
                    return (name, layer, target_id)
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
        if self.chroma_collection is not None:
            try:
                where_filter = None
                if system_layer and system_layer not in ("todos", "general", "all", "auto"):
                    where_filter = {"system_layer": system_layer}

                query_text = f"{target_part_id or ''} {query}".strip()
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

        norm_query = normalize_text(f"{target_part_id or ''} {query}")
        keywords = set(re.findall(r"\w+", norm_query))
        scored_chunks: List[tuple[float, MedicalDocumentChunk]] = []

        for chunk in self.chunks:
            score = 0.0
            chunk_text = normalize_text(f"{chunk.title} {chunk.content} {chunk.part_id}")

            if target_part_id and normalize_text(target_part_id) in normalize_text(chunk.part_id):
                score += 35.0
            if system_layer and normalize_text(system_layer) == normalize_text(chunk.system_layer):
                score += 15.0

            for kw in keywords:
                if len(kw) > 3:
                    if kw in normalize_text(chunk.title):
                        score += 10.0
                    if kw in chunk_text:
                        score += 2.0

            if score > 0:
                scored_chunks.append((score, chunk))

        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        top = scored_chunks[:n_results]

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
        topic_name: str,
        topic_layer: str,
        contexts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Generador educativo de alta precisión para responder exactamente a la consulta formulada."""
        q = normalize_text(query)
        sources = list(dict.fromkeys([c["source_file"] for c in contexts]))
        if not sources:
            sources = ["conceptos_fundamentales.md", "sistema_oseo.md"]

        # 1. ¿QUÉ ES EL HUESO?
        if any(term in q for term in ["que es el hueso", "que son los huesos", "el hueso", "los huesos", "tejido oseo"]):
            answer = (
                "### 🦴 ¿Qué es el hueso?\n\n"
                "**El hueso** es un órgano rígido, vivo y dinámico compuesto por **tejido conectivo mineralizado altamente vascularizado**. "
                "En el cuerpo humano adulto, el esqueleto consta de **206 huesos constantes** organizados en esqueleto axial y apendicular.\n\n"
                "#### 🔬 Composición Histológica y Celular:\n"
                "- **Matriz Extracelular**: Consta de una fracción orgánica (~35%, principalmente colágeno tipo I y proteoglicanos que aportan flexibilidad y resistencia a la tracción) "
                "y una fracción mineral inorgánica (~65%, cristales de hidroxiapatita cálcica $[Ca_{10}(PO_4)_6(OH)_2]$ que proporcionan dureza y resistencia a la compresión).\n"
                "- **Osteoblastos**: Células formadoras de hueso que sintetizan el osteoide inicial y dirigen la mineralización.\n"
                "- **Osteocitos**: Células maduras interconectadas por canalículos que detectan deformaciones mecánicas y regulan el remodelado óseo.\n"
                "- **Osteoclastos**: Células multinucleadas que reabsorben la matriz ósea mineralizada para permitir el recambio celular.\n\n"
                "#### 🏛️ Arquitectura Anatómica:\n"
                "- **Corteza de Hueso Compacto**: Formada por osteonas y sistemas de Havers concéntricos resistentes a la flexión y torsión.\n"
                "- **Hueso Esponjoso o Trabecular**: Red interna tridimensional que orienta sus trabéculas según las líneas de fuerza gravitatoria y aloja la médula ósea.\n"
                "- **Periostio**: Membrana osteógena externa ricamente inervada por fibras sensitivas de dolor.\n"
                "- **Médula Ósea**: Médula roja (hematopoyesis) y médula amarilla (adipocitos de reserva energética).\n\n"
                "#### ⚡ Funciones Vitales:\n"
                "1. **Soporte y Palancas**: Provee sostén biomecánico y puntos de anclaje para la acción muscular.\n"
                "2. **Protección**: Resguarda estructuras nobles (encéfalo, corazón, pulmones, médula espinal).\n"
                "3. **Almacén Mineral**: Aloja el **99% del calcio** y el **85% del fósforo** de todo el organismo.\n"
                "4. **Hematopoyesis**: Producción ininterrumpida de glóbulos rojos, glóbulos blancos y plaquetas.\n\n"
                "> ⚠️ **Recordatorio Educativo:** Información pedagógica; no sustituye la consulta médica especializada."
            )
            return {
                "answer": answer,
                "sources": ["conceptos_fundamentales.md", "sistema_oseo.md"],
                "related_structures": ["craneo", "femur_izq", "columna_vertebral", "humero_izq"],
            }

        # 2. ¿QUÉ ES EL MÚSCULO?
        if any(term in q for term in ["que es el musculo", "que son los musculos", "el musculo", "los musculos"]):
            answer = (
                "### 💪 ¿Qué es el músculo?\n\n"
                "**El músculo** es un tejido biológico contráctil especializado que convierte energía química en energía mecánica. "
                "El ser humano cuenta con más de **650 músculos esqueléticos** que representan entre el 40% y el 50% de la masa corporal.\n\n"
                "#### 🧬 Clasificación Funcional:\n"
                "- **Músculo Estriado Esquelético**: Voluntario, inervado por nervios somáticos y anclado a huesos por tendones.\n"
                "- **Músculo Estriado Cardíaco**: Involuntario, conforma el miocardio y se contrae rítmicamente sin fatiga.\n"
                "- **Músculo Liso**: Involuntario, situado en vísceras, vasos sanguíneos y esfínteres.\n\n"
                "#### ⚙️ Mecanismo de Contracción:\n"
                "El **sarcómero** es la unidad funcional elemental. El potencial de acción motor libera $Ca^{2+}$ en el sarcoplasma, "
                "permitiendo que las cabezas de **miosina** interactúen con la **actina**, produciendo el deslizamiento de miofilamentos y acortamiento muscular."
            )
            return {
                "answer": answer,
                "sources": ["conceptos_fundamentales.md", "sistema_muscular.md"],
                "related_structures": ["biceps_braquial_izq", "cuadriceps_izq", "deltoides_izq", "pectoral_mayor"],
            }

        # 3. ¿QUÉ ES EL SISTEMA NERVIOSO / NEURONA?
        if any(term in q for term in ["sistema nervioso", "que es una neurona", "la neurona", "el nervio"]):
            answer = (
                "### ⚡ ¿Qué es el Sistema Nervioso y la Neurona?\n\n"
                "**El sistema nervioso** es el centro de control y comunicación electroquímica del cuerpo humano. "
                "Se divide anatómicamente en **Sistema Nervioso Central (SNC)** (encéfalo y médula espinal) y "
                "**Sistema Nervioso Periférico (SNP)** (nervios craneales y espinales).\n\n"
                "#### 🧠 La Neurona:\n"
                "- **Soma**: Cuerpo metabólico neuronal.\n"
                "- **Dendritas**: Red receptora de señales aferentes.\n"
                "- **Axón**: Vía de conducción eferente con vaina de mielina para transmisión por saltos.\n"
                "- **Sinapsis**: Hendidura de comunicación neuroquímica intercelular."
            )
            return {
                "answer": answer,
                "sources": ["conceptos_fundamentales.md", "sistema_nervioso.md"],
                "related_structures": ["cerebro_encefalo", "medula_espinal", "plexo_braquial", "nervio_ciatico"],
            }

        # 4. RESPUESTA CONTEXTUAL PRECISIVA
        context_body = "\n".join([c["content"] for c in contexts[:2]])
        answer = (
            f"### 🩺 Análisis Clínico Educativo: {topic_name}\n\n"
            f"**Pregunta formulada:** *\"{query}\"*\n\n"
            f"#### 🧬 Hallazgos Anatómicos y Biomecánicos:\n"
            f"{context_body}\n\n"
            f"#### 🔬 Relevancia Clínica:\n"
            f"El conocimiento de **{topic_name}** es fundamental para la comprensión de las líneas de carga biomecánica, "
            f"la prevención de distensiones, fracturas o el abordaje de neuropatías compresivas.\n\n"
            f"> ⚠️ **Aviso:** Material educativo orientado a la formación médica."
        )

        return {
            "answer": answer,
            "sources": sources,
            "related_structures": [c["metadata"].get("part_id", "general") for c in contexts if c["metadata"].get("part_id")][:4],
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
                    "Eres el Asistente Clínico y Docente de NeuroAnatomy 3D. "
                    "Responde EXACTAMENTE a lo que el usuario pregunta. "
                    "Si pregunta '¿qué es el hueso?', responde sobre la definición, histología y función del hueso, NO sobre otra estructura. "
                    "Estructura tu respuesta con rigor pedagógico, emojis y viñetas claras. Termina con el disclaimer médico."
                )
                user_prompt = f"Pregunta: {question}\nContexto Médico:\n{context_str}"

                response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
                sources = list(dict.fromkeys([c["source_file"] for c in contexts]))
                return {
                    "answer": response.content,
                    "sources": sources,
                    "related_structures": [c["metadata"].get("part_id", "general") for c in contexts][:3],
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
                    "Eres el Asistente Clínico de NeuroAnatomy 3D. "
                    "Responde EXACTAMENTE a la pregunta formulada por el usuario con rigor médico."
                )
                response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=f"Pregunta: {question}\nContexto:\n{context_str}")])
                sources = list(dict.fromkeys([c["source_file"] for c in contexts]))
                return {
                    "answer": response.content,
                    "sources": sources,
                    "related_structures": [c["metadata"].get("part_id", "general") for c in contexts][:3],
                }
            except Exception as e:
                logger.error(f"Error invocando OpenAI API: {e}. Empleando fallback local.")

        return self._generate_mock_response(question, topic_name, effective_layer, contexts)
