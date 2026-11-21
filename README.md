# NeuroAnatomy 3D — Atlas Anatómico Interactivo 3D con Asistente Clínico Educativo

<div align="center">

![Angular](https://img.shields.io/badge/Angular-18+-DD0031?style=for-the-badge&logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r128+-000000?style=for-the-badge&logo=three.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector_Store-FF6F00?style=for-the-badge&logo=databricks&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.4+-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

<p align="center">
  <b>Atlas anatómico 3D de alta fidelidad con selección mediante Raycasting y consultor clínico educativo impulsado por IA y Retrieval-Augmented Generation (RAG).</b>
</p>

</div>

---

> [!WARNING]
> ### AVISO LEGAL Y CLÍNICO OBLIGATORIO (DISCLAIMER)
> **NeuroAnatomy 3D** es una plataforma de software diseñada exclusivamente con fines **educativos, académicos, de divulgación científica y entrenamiento biomecánico**.
> 
> * La información generada por el motor RAG y los modelos de lenguaje (LLM) **NO constituye asesoramiento médico, diagnóstico clínico ni recomendación terapéutica**.
> * Ninguna interacción en esta aplicación debe utilizarse para sustituir el juicio clínico de un médico o profesional sanitario cualificado.
> * Ante cualquier dolencia, síntoma o situación de emergencia, acuda inmediatamente a un centro de salud o consulte a un especialista colegiado.

---

## 🌟 Características Principales

1. **Visor Anatómico 3D Interactivo (Three.js + Angular 18+)**:
   - Escena con iluminación cinematográfica de tres puntos y fondo estilo estudio médico oscuro (`#0b1120`).
   - Control orbital con inercia (`OrbitControls` con `enableDamping: true`).
   - Detección precisa de partes anatómicas con ratón (`Raycasting`), efecto emisivo en hover y selección con zoom focal.
   - **Soporte Dual de Modelos**: Carga automática de modelos GLTF (`/assets/models/human_anatomy.glb`) con fallback inmediato a un maniquí anatómico articulado procedural con mallas agrupadas por capas.
   - Controles de visualización: filtrado por capas (**Esqueleto Óseo**, **Sistema Muscular**, **Sistema Nervioso**, **Todos**) y activación de modo **Wireframe**.

2. **Asistente Clínico Inteligente RAG (FastAPI + ChromaDB + LangChain)**:
   - Indexación semántica en tiempo real de corpus anatómicos y biomecánicos especializados.
   - Búsqueda vectorial con ChromaDB que recupera contexto anatómico exacto, inserciones, biomecánica y patologías asociadas.
   - **Soporte Multi-Proveedor**: Google Gemini API, OpenAI API y modo `mock` inteligente local (permite ejecución 100% offline sin costo ni necesidad de API Keys).
   - Respuestas estructuradas con fuentes bibliográficas y estructuras anatómicas correlacionadas.

3. **Arquitectura Reactiva y Moderna**:
   - Frontend basado en Standalone Components de Angular 18+, Signals reactivos y Tailwind CSS con estética clínica oscura.
   - Backend asíncrono con FastAPI, Pydantic v2 y arquitectura modular desacoplada.

---

## 🏛️ Diagrama de Arquitectura de Flujo

```
+-------------------------------------------------------------------------------------------------+
|                                     NAVEGADOR WEB (USUARIO)                                     |
|                                                                                                 |
|   +---------------------------------------------+   +----------------------------------------+  |
|   |          Visor 3D (Three.js Engine)         |   |      Panel Clínico (Angular Signals)   |  |
|   |                                             |   |                                        |  |
|   |  - Render Loop & OrbitControls con Damping  |   |  - Selección de estructura activa      |  |
|   |  - Raycasting: Hover emisivo & Selección    |   |  - Botones de consulta rápida          |  |
|   |  - Filtro de Capas (Óseo/Muscular/Nervioso) |   |  - Historial de chat en tiempo real    |  |
|   |  - Maniquí Articulado Procedural / GLTF     |   |  - Citas de documentos científicos     |  |
|   +----------------------|----------------------+   +-------------------|--------------------+  |
|                          |                                              |                       |
|                          +----------------------+-----------------------+                       |
|                                                 |                                               |
|                                     [ AnatomyApiService ]                                       |
|                               (HttpClient & Signals State Store)                                |
+-------------------------------------------------|-----------------------------------------------+
                                                  |
                                                  | Peticiones HTTP REST (Puerto 8000)
                                                  v
+-------------------------------------------------------------------------------------------------+
|                                      BACKEND (FASTAPI)                                          |
|                                                                                                 |
|   +------------------------------------------------------------------------------------------+  |
|   |                                      FastAPI Router                                      |  |
|   |   GET  /api/health            -> Diagnóstico del sistema y conteo de vectores             |  |
|   |   GET  /api/anatomy/{part_id} -> Ficha técnica anatómica detallada                       |  |
|   |   POST /api/chat/consult      -> Consulta clínica enriquecida con contexto RAG           |  |
|   +---------------------------------------------|--------------------------------------------+  |
|                                                 |                                               |
|                                                 v                                               |
|   +------------------------------------------------------------------------------------------+  |
|   |                                 Motor RAG (rag_engine.py)                                |  |
|   |                                                                                          |  |
|   |  1. Auto-indexador al arranque:                                                          |  |
|   |     Lee Markdown en /data/medical_docs/ y vectoriza fragmentos en ChromaDB               |  |
|   |  2. Búsqueda Vectorial por Similitud Semántica                                           |  |
|   |  3. Orquestador LLM: Gemini API / OpenAI API / Modo Fallback Local Simulado              |  |
|   +---------------------------------------------|--------------------------------------------+  |
|                                                 |                                               |
|                                                 v                                               |
|   +------------------------------------------------------------------------------------------+  |
|   |                               ChromaDB Vector Store (Local)                              |  |
|   |   Colección médica persistente: medical_knowledge_base                                   |  |
|   +------------------------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------------------------+
```

---

## 📂 Estructura del Repositorio

```text
neuroanatomy-3d/
├── .gitignore
├── README.md
├── docker-compose.yml
├── docs/
│   └── architecture.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   ├── data/
│   │   └── medical_docs/
│   │       ├── sistema_oseo.md
│   │       ├── sistema_muscular.md
│   │       └── sistema_nervioso.md
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       └── rag_engine.py
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.js
    └── src/
        ├── index.html
        ├── main.ts
        ├── styles.css
        └── app/
            ├── app.component.ts
            ├── app.component.html
            ├── services/
            │   └── anatomy-api.service.ts
            └── components/
                ├── anatomy-viewer/
                │   └── anatomy-viewer.component.ts
                └── clinical-chat/
                    └── clinical-chat.component.ts
```

---

## 🚀 Guía de Ejecución

### Opción 1: Ejecución con Docker y Docker Compose (Recomendada)

Solo necesitas tener instalado Docker Desktop y ejecutar:

```bash
# Clonar el repositorio
git clone https://github.com/CryptonDevAlex/neuroanatomy-3d.git
cd neuroanatomy-3d

# Levantar los servicios de frontend y backend
docker compose up --build
```

Una vez levantados los contenedores:
* **Frontend Web (Angular + Nginx)**: [http://localhost:4200](http://localhost:4200)
* **Backend API (FastAPI + Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

### Opción 2: Ejecución Local en Entorno de Desarrollo

#### 1. Configurar y Arrancar el Backend

```bash
cd backend

# Crear entorno virtual
python -m venv .venv

# Activar en Windows PowerShell:
.venv\Scripts\Activate.ps1
# O en Linux/macOS:
# source .venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno (por defecto LLM_PROVIDER=mock)
cp .env.example .env

# Iniciar servidor Uvicorn con recarga en caliente
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Configurar y Arrancar el Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo de Angular
npm start
# O: npx ng serve --port 4200
```

Abre tu navegador en [http://localhost:4200](http://localhost:4200).

---

## ⚙️ Configuración del Motor RAG (`.env`)

En `backend/.env` puedes elegir el proveedor de Inteligencia Artificial:

| Variable | Opciones | Descripción |
|---|---|---|
| `LLM_PROVIDER` | `mock` (default), `gemini`, `openai` | Modo simulado sin coste o APIs reales |
| `GEMINI_API_KEY` | `AIzaSy...` | Clave API de Google Gemini (Google AI Studio) |
| `OPENAI_API_KEY` | `sk-...` | Clave API de OpenAI |
| `CHROMA_PERSIST_DIR` | `./chroma_db` | Directorio local de persistencia vectorial |

> [!TIP]
> Si no configuras ninguna API Key y dejas `LLM_PROVIDER=mock`, el sistema funcionará al 100% utilizando el extractor semántico con ChromaDB y un sintetizador determinista basado en los documentos médicos incluidos.

---

## 📜 Licencia

Proyecto distribuido bajo la licencia MIT. Consulta el archivo `LICENSE` para más detalles.
