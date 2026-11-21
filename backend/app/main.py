"""NeuroAnatomy 3D - Servidor FastAPI y API REST de Asistencia Clínica."""

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.rag_engine import MedicalRAGEngine

# Inicializar aplicación FastAPI
app = FastAPI(
    title="NeuroAnatomy 3D - Clinical Knowledge & RAG API",
    description="API para el atlas anatómico 3D con motor RAG, búsqueda semántica y asistencia clínica formativa.",
    version="1.0.0",
)

# Configuración de CORS
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200")
allowed_origins = [orig.strip() for orig in allowed_origins_env.split(",") if orig.strip()]
if "*" not in allowed_origins and "http://localhost:4200" not in allowed_origins:
    allowed_origins.append("http://localhost:4200")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if "*" not in allowed_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializar motor RAG
rag_engine = MedicalRAGEngine()


# ==========================================
# Modelos Pydantic de Entrada / Salida
# ==========================================

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "NeuroAnatomy 3D Clinical RAG Engine"
    llm_provider: str
    documents_indexed: int
    chromadb_available: bool
    timestamp: str


class AnatomyDetailResponse(BaseModel):
    id: str
    name: str
    latin_name: str
    system_layer: str
    classification: str
    function: str
    insertions_or_origin: str
    innervation_or_blood_supply: str
    biomechanics: str
    clinical_relevance: str
    common_pathologies: List[str]
    quick_questions: List[str]


class ConsultRequest(BaseModel):
    selected_part: Optional[str] = Field(
        None, description="Identificador de la parte anatómica seleccionada (ej. 'craneo', 'biceps_braquial_izq')"
    )
    system_layer: str = Field(
        "todos", description="Capa del sistema anatómico: 'oseo', 'muscular', 'nervioso' o 'todos'"
    )
    question: str = Field(..., min_length=2, description="Pregunta clínica o anatómica formulada")


class ConsultResponse(BaseModel):
    answer: str
    sources: List[str]
    related_structures: List[str]
    timestamp: str


# ==========================================
# Base de Datos Estructurada de Anatomía
# ==========================================

ANATOMY_DATABASE: Dict[str, Dict[str, Any]] = {
    "craneo": {
        "name": "Cráneo y Macizo Facial",
        "latin_name": "Cranium",
        "system_layer": "oseo",
        "classification": "Hueso plano / Esqueleto axial",
        "function": "Protección hermética del encéfalo y órganos sensoriales superiores. Soporte estructural masticatorio.",
        "insertions_or_origin": "Músculo temporal, masetero, esternocleidomastoideo, trapecio en línea nucal.",
        "innervation_or_blood_supply": "Pares craneales (I-XII); irrigación por arterias carótidas y vertebrales.",
        "biomechanics": "Distribución y disipación de cargas masticatorias y de impactos externos mediante pilares óseos.",
        "clinical_relevance": "Estructura crítica en traumatismos encefalocraneanos, fracturas de base y control de PIC.",
        "common_pathologies": ["Traumatismo craneoencefálico (TCE)", "Fractura de base de cráneo", "Hematoma epidural y subdural", "Maloclusión mandibular"],
        "quick_questions": ["¿Qué estructuras atraviesan el foramen magnum?", "¿Cuáles son los signos de fractura de base de cráneo?", "¿Cómo se distribuyen las fuerzas masticatorias?"]
    },
    "columna_vertebral": {
        "name": "Columna Vertebral y Canal Raquídeo",
        "latin_name": "Columna Vertebralis",
        "system_layer": "oseo",
        "classification": "Esqueleto axial / Eje postural",
        "function": "Soporte axial corporal, protección del eje medular y salida de raíces nerviosas espinales.",
        "insertions_or_origin": "Músculos multífidos, iliocostal, longísimo, psoas mayor, ligamento longitudinal común.",
        "innervation_or_blood_supply": "Ramas posteriores de nervios espinales; arterias espinales anterior y posteriores.",
        "biomechanics": "Amortiguación hidrostática dinámica mediante discos intervertebrales y curvaturas sagitales fisiológicas.",
        "clinical_relevance": "Epicentro de lumbalgias, hernias de núcleo pulposo y radiculopatías motoras.",
        "common_pathologies": ["Hernia discal lumbar (L4-L5, L5-S1)", "Espondilolistesis", "Estenosis de canal medular", "Escoliosis idiopática"],
        "quick_questions": ["¿Cómo se produce una hernia discal?", "¿Qué función cumplen las curvaturas lordótica y cifótica?", "¿Qué raíces forman la cauda equina?"]
    },
    "torax_costillas": {
        "name": "Tórax Óseo y Costillas",
        "latin_name": "Thorax / Costae",
        "system_layer": "oseo",
        "classification": "Jaula osteocartilaginosa",
        "function": "Protección cardiorrespiratoria elástica y fuelle mecánico para la ventilación pulmonar.",
        "insertions_or_origin": "Músculos intercostales, diafragma, pectoral mayor y menor, serrato anterior.",
        "innervation_or_blood_supply": "Nervios y arterias intercostales en el canal subcostal.",
        "biomechanics": "Movimientos combinados en 'asa de balde' y 'brazo de bomba' para la expansión volumétrica inspiratoria.",
        "clinical_relevance": "Vulnerable a traumatismos torácicos cerrados, fracturas y laceración pleuropulmonar.",
        "common_pathologies": ["Fracturas costales", "Tórax batiente o inestable (volet costal)", "Neumotórax traumático", "Costocondritis"],
        "quick_questions": ["¿Qué biomecánica explica el movimiento de asa de balde?", "¿Qué es un volet costal y por qué es una emergencia?", "¿Dónde discurre el paquete neurovascular intercostal?"]
    },
    "humero_izq": {
        "name": "Húmero (Brazo)",
        "latin_name": "Humerus",
        "system_layer": "oseo",
        "classification": "Hueso largo / Miembro superior",
        "function": "Palanca de propulsión y posicionamiento tridimensional de la mano en el espacio.",
        "insertions_or_origin": "Manguito rotador en troquíter/troquín; deltoides en tuberosidad en V; pectoral mayor en cresta lateral.",
        "innervation_or_blood_supply": "Nervio radial, axilar y musculocutáneo; arteria braquial.",
        "biomechanics": "Articulación glenohumeral con 3 grados de libertad (enartrosis con máxima movilidad).",
        "clinical_relevance": "Riesgo de lesión del nervio radial en fracturas diafisarias y de arteria axilar en cuello quirúrgico.",
        "common_pathologies": ["Fractura de diáfisis humeral con mano caída", "Fractura de cuello quirúrgico", "Epicondilalgia lateral"],
        "quick_questions": ["¿Qué consecuencias tiene la fractura diafisaria sobre el nervio radial?", "¿Qué músculos forman el manguito rotador?", "¿Cuál es el mecanismo de luxación glenohumeral?"]
    },
    "femur_izq": {
        "name": "Fémur (Muslo)",
        "latin_name": "Femur",
        "system_layer": "oseo",
        "classification": "Hueso largo / Miembro inferior",
        "function": "Soporte de masa corporal y propulsión bipedal durante la marcha y el salto.",
        "insertions_or_origin": "Glúteos medio/menor en trocánter mayor; psoas en trocánter menor; aductores en línea áspera.",
        "innervation_or_blood_supply": "Nervio femoral y ciático; arterias circunflejas femorales medial y lateral.",
        "biomechanics": "Transmisión de tensiones y compresión en cuello femoral con ángulo cérvico-diafisario de ~126°.",
        "clinical_relevance": "Alta morbimortalidad en fracturas de cuello en ancianos por riesgo de necrosis avascular.",
        "common_pathologies": ["Fractura de cuello femoral intracapsular", "Necrosis avascular de cabeza femoral", "Fractura diafisaria con hemorragia"],
        "quick_questions": ["¿Por qué las fracturas del cuello femoral conllevan necrosis avascular?", "¿Qué función estabilizadora cumple el glúteo medio en apoyo monopodal?", "¿Qué estructuras se insertan en la línea áspera?"]
    },
    "deltoides_izq": {
        "name": "Músculo Deltoides",
        "latin_name": "Musculus Deltoideus",
        "system_layer": "muscular",
        "classification": "Músculo peniforme multipenado",
        "function": "Abducción principal del hombro (15°-90°), flexión, extensión y rotaciones glenohumerales.",
        "insertions_or_origin": "Clavícula, acromion y espina escapular hasta tuberosidad deltoidea del húmero.",
        "innervation_or_blood_supply": "Nervio axilar (circunflejo, C5-C6); arteria circunfleja humeral posterior.",
        "biomechanics": "Vector de fuerza con componente elevador y coaptador según el grado de abducción escapulohumeral.",
        "clinical_relevance": "Sitio de inyecciones intramusculares y sujeto a denervación en luxaciones glenohumerales.",
        "common_pathologies": ["Atrofia por neuropatía del nervio axilar", "Bursitis subdeltoidea", "Tendinitis por sobreuso"],
        "quick_questions": ["¿Quién inicia la abducción antes de los 15°?", "¿Qué nervio puede lesionarse tras una luxación de hombro?", "¿Cómo se exploran las tres porciones del deltoides?"]
    },
    "pectoral_mayor": {
        "name": "Músculo Pectoral Mayor",
        "latin_name": "Musculus Pectoralis Major",
        "system_layer": "muscular",
        "classification": "Músculo ancho convergente",
        "function": "Potente aducción, rotación interna y flexión anterior del brazo; músculo accesorio inspiratorio.",
        "insertions_or_origin": "Clavícula medial, cara anterior del esternón y cartílagos costales hasta la cresta del tubérculo mayor.",
        "innervation_or_blood_supply": "Nervios pectorales medial y lateral (C5-T1); arteria toracoacromial.",
        "biomechanics": "Aducción horizontal máxima con potente torque de aproximación torácica.",
        "clinical_relevance": "Propenso a desgarros tendinosos en atletas de fuerza en ejercicios de tracción y empuje.",
        "common_pathologies": ["Desgarro o avulsión tendinosa en press de banca", "Contracturas miofasciales pectorales", "Síndrome de Poland"],
        "quick_questions": ["¿Cómo se diagnostica una avulsión tendinosa del pectoral mayor?", "¿Qué porción participa en la inspiración forzada?", "¿Cuál es su relación con la fosa axilar anterior?"]
    },
    "biceps_braquial_izq": {
        "name": "Músculo Bíceps Braquial",
        "latin_name": "Musculus Biceps Brachii",
        "system_layer": "muscular",
        "classification": "Músculo fusiforme bicéfalo",
        "function": "Supinador más potente del antebrazo con codo en 90° y flexor dinámico del codo.",
        "insertions_or_origin": "Cabeza corta en coracoides; cabeza larga en tubérculo supraglenoideo hasta tuberosidad bicipital del radio.",
        "innervation_or_blood_supply": "Nervio musculocutáneo (C5-C7); ramas musculares de la arteria braquial.",
        "biomechanics": "Palanca de 3er género con ventaja mecánica para la supinación y aceleración del antebrazo.",
        "clinical_relevance": "Patología muy prevalente en tendón largo y desinserciones labrales de hombro.",
        "common_pathologies": ["Tendinopatía bicipital", "Rotura proximal con signo de Popeye", "Lesión del labrum SLAP"],
        "quick_questions": ["¿Por qué el bíceps es más supinador que flexor?", "¿Qué es el signo de Popeye en traumatología?", "¿Qué diferencia funcional tienen la cabeza larga y corta?"]
    },
    "abdominales_recto": {
        "name": "Músculos Abdominales y Pared Anterior",
        "latin_name": "Musculus Rectus Abdominis",
        "system_layer": "muscular",
        "classification": "Músculo poligástrico plano",
        "function": "Flexión del tronco, retroversión pélvica, estabilización del core y aumento de presión intraabdominal.",
        "insertions_or_origin": "Cartílagos costales 5°-7° y xifoides hasta la sínfisis pubiana y cresta del pubis.",
        "innervation_or_blood_supply": "Nervios intercostales T7-T12; arterias epigástricas superior e inferior.",
        "biomechanics": "Contrapeso miofascial frente a los erectores espinales para evitar la hiperlordosis.",
        "clinical_relevance": "Elemento clave en la patología del piso pélvico, diástasis y pubalgias del atleta.",
        "common_pathologies": ["Diástasis de rectos", "Pubalgia del deportista", "Hernia de la línea alba o umbilical"],
        "quick_questions": ["¿Qué relación biomecánica tiene con la pubalgia del atleta?", "¿Cómo se clasifica la diástasis abdominal?", "¿Qué papel juega la maniobra de Valsalva?"]
    },
    "cuadriceps_izq": {
        "name": "Músculo Cuádriceps Femoral",
        "latin_name": "Musculus Quadriceps Femoris",
        "system_layer": "muscular",
        "classification": "Músculo tetracéfalo volumétrico",
        "function": "Extensión primaria de la rodilla y flexión accesoria de cadera (recto femoral).",
        "insertions_or_origin": "Espina ilíaca y fémur anterior/lateral hasta tuberosidad anterior tibial vía tendón rotuliano.",
        "innervation_or_blood_supply": "Nervio femoral (L2-L4); arteria circunfleja femoral lateral.",
        "biomechanics": "La rótula incrementa el brazo de palanca biomecánico del aparato extensor hasta un 30%.",
        "clinical_relevance": "Fundamental en la estabilidad articular femorotibial y marcha erguida.",
        "common_pathologies": ["Tendinopatía rotuliana (rodilla del saltador)", "Desgarro del recto femoral", "Síndrome femoropatelar"],
        "quick_questions": ["¿Cómo mejora la rótula la biomecánica del cuádriceps?", "¿Qué vientre estabiliza medialmente a la rótula?", "¿Cuáles son los factores de riesgo en desgarros del recto anterior?"]
    },
    "cerebro_encefalo": {
        "name": "Cerebro y Hemisferios Cerebrales",
        "latin_name": "Encephalon / Cerebrum",
        "system_layer": "nervioso",
        "classification": "Sistema Nervioso Central (SNC)",
        "function": "Integración sensitiva, comando motor voluntario, cognición ejecutiva, memoria y lenguaje.",
        "insertions_or_origin": "Contenido en la cavidad craneal; suspendido en LCR por meninges (duramadre, aracnoides, piamadre).",
        "innervation_or_blood_supply": "Polígono de Willis (arterias cerebrales anterior, media y posterior).",
        "biomechanics": "Transmisión y transducción de señales bioeléctricas y electroquímicas de alta velocidad.",
        "clinical_relevance": "Zona noble y vulnerable a isquemia cerebral por alto consumo metabólico de glucosa y oxígeno.",
        "common_pathologies": ["Accidente Cerebrovascular (ACV) isquémico y hemorrágico", "Traumatismo encéfalo craneano", "Aneurisma cerebral", "Epilepsia focal"],
        "quick_questions": ["¿Qué arterias conforman el Polígono de Willis?", "¿Qué diferencia clínica existe entre la Afasia de Broca y la de Wernicke?", "¿Cuáles son las ventanas de tiempo en la trombólisis de un ACV?"]
    },
    "medula_espinal": {
        "name": "Médula Espinal",
        "latin_name": "Medulla Spinalis",
        "system_layer": "nervioso",
        "classification": "Sistema Nervioso Central (SNC)",
        "function": "Conducción bidireccional entre encéfalo y periferia; centro generador de arcos reflejos somáticos.",
        "insertions_or_origin": "Desde foramen magnum hasta cono medular a nivel L1-L2; sostenida por ligamentos dentados.",
        "innervation_or_blood_supply": "Arteria espinal anterior y dos arterias espinales posteriores.",
        "biomechanics": "Vías piramidales motoras descendentes y haces espinotalámicos/cordonales ascendentes.",
        "clinical_relevance": "Traumatismos o compresiones provocan déficits motores y sensoriales irreversibles.",
        "common_pathologies": ["Shock medular", "Síndrome de Brown-Séquard", "Síndrome de cola de caballo", "Esclerosis múltiple"],
        "quick_questions": ["¿Qué caracteriza al síndrome de Brown-Séquard?", "¿Por qué el síndrome de cauda equina es una urgencia quirúrgica?", "¿A qué nivel termina el cono medular en adultos?"]
    },
    "plexo_braquial": {
        "name": "Plexo Braquial",
        "latin_name": "Plexus Brachialis",
        "system_layer": "nervioso",
        "classification": "Sistema Nervioso Periférico (SNP)",
        "function": "Inervación sensitiva y motora integral del hombro, brazo, antebrazo y mano.",
        "insertions_or_origin": "Ramas anteriores de raíces C5 a T1 emergiendo entre los músculos escalenos anterior y medio.",
        "innervation_or_blood_supply": "Arteria axilar y ramas colaterales cervicales.",
        "biomechanics": "Red anastomótica que redistribuye axones motores y sensitivos hacia nervios periféricos terminales.",
        "clinical_relevance": "Vulnerable a tracciones perinatales, caídas en motocicleta y compresión torácica.",
        "common_pathologies": ["Parálisis de Erb-Duchenne (C5-C6)", "Parálisis de Klumpke (C8-T1)", "Síndrome del opérculo torácico"],
        "quick_questions": ["¿Cuál es el mecanismo lesional en la parálisis de Erb-Duchenne?", "¿Qué nervios terminales se originan de los fascículos?", "¿Cómo se manifiesta la afección del nervio mediano?"]
    },
    "nervio_ciatico": {
        "name": "Nervio Ciático (Isquiático)",
        "latin_name": "Nervus Ischiadicus",
        "system_layer": "nervioso",
        "classification": "Nervio periférico mixto / Plexo lumbosacro",
        "function": "Inervación motora de isquiotibiales y musculatura infrapatelar; sensibilidad de la pierna y pie.",
        "insertions_or_origin": "Raíces L4-S3 emergiendo por foramen ciático mayor bajo el músculo piriforme.",
        "innervation_or_blood_supply": "Arteria acompañante del nervio ciático (rama glútea inferior).",
        "biomechanics": "Nervio más largo y ancho del cuerpo (hasta 2 cm de diámetro).",
        "clinical_relevance": "Causa principal de radiculopatía incapacitante lumbo-pélvica y marcha patológica.",
        "common_pathologies": ["Ciatalgia compresiva por hernia discal", "Síndrome del músculo piriforme", "Marcha en estepaje por atrapamiento peroneo"],
        "quick_questions": ["¿Qué maniobras clínicas evalúan el dolor ciático (Lasègue, Bragard)?", "¿En qué dos ramas principales se divide en la fosa poplítea?", "¿Qué causa la marcha en estepaje o pie caído?"]
    }
}

# Alias y duplicados simétricos (derecha / izquierda)
ANATOMY_DATABASE["humero_der"] = dict(ANATOMY_DATABASE["humero_izq"], name="Húmero Derecho", id="humero_der")
ANATOMY_DATABASE["femur_der"] = dict(ANATOMY_DATABASE["femur_izq"], name="Fémur Derecho", id="femur_der")
ANATOMY_DATABASE["deltoides_der"] = dict(ANATOMY_DATABASE["deltoides_izq"], name="Músculo Deltoides Derecho", id="deltoides_der")
ANATOMY_DATABASE["biceps_braquial_der"] = dict(ANATOMY_DATABASE["biceps_braquial_izq"], name="Músculo Bíceps Braquial Derecho", id="biceps_braquial_der")
ANATOMY_DATABASE["cuadriceps_der"] = dict(ANATOMY_DATABASE["cuadriceps_izq"], name="Músculo Cuádriceps Femoral Derecho", id="cuadriceps_der")


# ==========================================
# Rutas y Controladores de la API
# ==========================================

@app.get("/api/health", response_model=HealthResponse)
def health_check():
    """Comprueba el estado del backend, documentos indexados y motor RAG."""
    return HealthResponse(
        status="healthy",
        service="NeuroAnatomy 3D Clinical RAG Engine",
        llm_provider=rag_engine.provider,
        documents_indexed=len(rag_engine.chunks),
        chromadb_available=rag_engine.chroma_collection is not None,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/api/anatomy/{part_id}", response_model=AnatomyDetailResponse)
def get_anatomy_detail(part_id: str):
    """Devuelve la ficha técnica clínica estructurada de una estructura anatómica."""
    key = part_id.lower().strip()
    
    # Búsqueda directa o coincidencia parcial
    data = ANATOMY_DATABASE.get(key)
    if not data:
        for k, v in ANATOMY_DATABASE.items():
            if k in key or key in k:
                data = v
                break

    if not data:
        # Generar ficha genérica estructurada si no coincide exactamente
        return AnatomyDetailResponse(
            id=part_id,
            name=part_id.replace("_", " ").title(),
            latin_name=f"Structura {part_id}",
            system_layer="general",
            classification="Elemento anatómico corporal",
            function="Soporte y coordinación dentro del sistema biomecánico humano.",
            insertions_or_origin="Inserciones anatómicas complejas asociadas al segmento corporal.",
            innervation_or_blood_supply="Inervación periférica e irrigación vascular por ramas segmentarias.",
            biomechanics="Transmisión biomecánica de esfuerzos axiales y viscoelásticos.",
            clinical_relevance="Estructura susceptible a traumatismos mecánicos o procesos inflamatorios locales.",
            common_pathologies=["Sobrecarga biomecánica", "Distensión o contusión local", "Inflamación aguda"],
            quick_questions=[
                f"¿Qué función principal cumple {part_id}?",
                f"¿Cuáles son las patologías más frecuentes de {part_id}?",
                "¿Cómo se explora en el examen físico?"
            ]
        )

    return AnatomyDetailResponse(
        id=part_id,
        name=data["name"],
        latin_name=data["latin_name"],
        system_layer=data["system_layer"],
        classification=data["classification"],
        function=data["function"],
        insertions_or_origin=data["insertions_or_origin"],
        innervation_or_blood_supply=data["innervation_or_blood_supply"],
        biomechanics=data["biomechanics"],
        clinical_relevance=data["clinical_relevance"],
        common_pathologies=data["common_pathologies"],
        quick_questions=data["quick_questions"],
    )


@app.post("/api/chat/consult", response_model=ConsultResponse)
def consult_clinical_rag(req: ConsultRequest):
    """Procesa una consulta del usuario mediante el motor RAG y conocimiento médico."""
    if not req.question or not req.question.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La consulta no puede estar vacía."
        )

    result = rag_engine.consult(
        question=req.question.strip(),
        selected_part=req.selected_part,
        system_layer=req.system_layer or "todos",
    )

    return ConsultResponse(
        answer=result.get("answer", "No se pudo generar respuesta."),
        sources=result.get("sources", []),
        related_structures=result.get("related_structures", []),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
