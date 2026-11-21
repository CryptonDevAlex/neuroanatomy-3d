# Arquitectura Técnica — NeuroAnatomy 3D

## Visión General del Sistema

NeuroAnatomy 3D es una plataforma educativa de grado médico que integra visualización tridimensional en tiempo real, interacción mediante raycasting y un motor de Generación Aumentada por Recuperación (RAG) para proporcionar respuestas clínicas basadas en evidencia anatómica.

```
+-----------------------------------------------------------------------------------------+
|                                    NAVEGADOR WEB (CLIENTE)                              |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  |                             Angular 18+ Application                               |  |
|  |                                                                                   |  |
|  |  +-------------------------------------+   +-----------------------------------+  |  |
|  |  |  AnatomyViewerComponent (Three.js)  |   |  ClinicalChatComponent (Signals)  |  |  |
|  |  |  - Scene, Camera, WebGLRenderer     |   |  - Reactive chat feed             |  |  |
|  |  |  - OrbitControls (Damping)          |   |  - Anatomical detail card         |  |  |
|  |  |  - Dual Loader (GLTF + Procedural)  |   |  - Source attribution citations   |  |  |
|  |  |  - Raycaster (Hover/Click Mesh)     |   |  - Quick action medical prompt    |  |  |
|  |  |  - Layer Filter (Bone, Muscle, Nrv) |   |                                   |  |  |
|  |  +------------------+------------------+   +-----------------+-----------------+  |  |
|  |                     |                                        |                    |  |
|  |                     +-------------------+--------------------+                    |  |
|  |                                         |                                         |  |
|  |                         +---------------+---------------+                         |  |
|  |                         |    AnatomyApiService (HTTP)   |                         |  |
|  |                         +---------------+---------------+                         |  |
|  +-----------------------------------------|-----------------------------------------+  |
+--------------------------------------------|--------------------------------------------+
                                             | HTTP / JSON REST Calls
                                             | (Port 8000)
                                             v
+-----------------------------------------------------------------------------------------+
|                                    BACKEND (FASTAPI)                                    |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  |                               FastAPI Application Router                         |  |
|  |                                                                                   |  |
|  |  Endpoints:                                                                       |  |
|  |  - GET  /api/health                                                               |  |
|  |  - GET  /api/anatomy/{part_id}                                                    |  |
|  |  - POST /api/chat/consult                                                         |  |
|  +-----------------------------------------+-----------------------------------------+  |
|                                            |                                            |
|                                            v                                            |
|  +-----------------------------------------------------------------------------------+  |
|  |                                    RAG Engine                                     |  |
|  |                                                                                   |  |
|  |  1. Document Ingestion & Chunking:                                                |  |
|  |     Reads Markdown Corpus from /data/medical_docs/                                |  |
|  |     (sistema_oseo.md, sistema_muscular.md, sistema_nervioso.md)                   |  |
|  |                                                                                   |  |
|  |  2. Semantic Search:                                                              |  |
|  |     Queries ChromaDB vector collection with anatomical contextual filters         |  |
|  |                                                                                   |  |
|  |  3. Multi-Provider LLM Synthesizer:                                               |  |
|  |     - Google Gemini API (gemini-1.5-flash / pro)                                  |  |
|  |     - OpenAI API (gpt-4o-mini / gpt-4o)                                           |  |
|  |     - Mock Deterministic Synthesizer (Zero-cost offline fallback)                 |  |
|  +-----------------------------------------+-----------------------------------------+  |
|                                            | Embeddings & Vectors                       |
|                                            v                                            |
|  +-----------------------------------------------------------------------------------+  |
|  |                                ChromaDB Vector Store                              |  |
|  |  - Persisted embeddings collection: medical_knowledge_base                         |  |
|  |  - Cosine distance similarity retrieval                                           |  |
|  +-----------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------+
```

## Capas Anatómicas del Maniquí 3D

1. **Capa Ósea (`oseo`)**:
   - `craneo`: Neurocráneo y viscerocráneo.
   - `columna_vertebral`: Vértebras cervicales, torácicas, lumbares y sacro.
   - `torax_costillas`: Caja torácica y esternón.
   - `humero_izq`, `humero_der`: Esqueleto apendicular superior.
   - `femur_izq`, `femur_der`: Esqueleto apendicular inferior.

2. **Capa Muscular (`muscular`)**:
   - `deltoides_izq`, `deltoides_der`: Abducción y estabilización glenohumeral.
   - `pectoral_mayor`: Aducción y rotación medial del brazo.
   - `biceps_braquial_izq`, `biceps_braquial_der`: Flexión y supinación de antebrazo.
   - `abdominales_recto`: Flexión del tronco y contención visceral.
   - `cuadriceps_izq`, `cuadriceps_der`: Extensión de la rodilla y flexión coxofemoral.

3. **Capa Nerviosa (`nervioso`)**:
   - `cerebro_encefalo`: Sistema Nervioso Central (corteza, diencéfalo, tallo).
   - `medula_espinal`: Conducción neural somática y refleja.
   - `plexo_braquial`: Inervación de miembros superiores.
   - `nervio_ciatico`: Tronco neural motor y sensitivo lumbosacro.
