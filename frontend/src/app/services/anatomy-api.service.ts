import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap, timeout } from 'rxjs';

export interface AnatomyDetail {
  id: string;
  name: string;
  latin_name: string;
  system_layer: string;
  classification: string;
  function: string;
  insertions_or_origin: string;
  innervation_or_blood_supply: string;
  biomechanics: string;
  clinical_relevance: string;
  common_pathologies: string[];
  quick_questions: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  sources?: string[];
  related_structures?: string[];
  timestamp: string;
}

export interface ConsultResponse {
  answer: string;
  sources: string[];
  related_structures: string[];
  timestamp: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  llm_provider: string;
  documents_indexed: number;
  chromadb_available: boolean;
  timestamp: string;
}

export interface ExamQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  answer: number;
  explanation: string;
}

export const EXAM_SOURCE = 'MMLU-Redux (anatomy), CC BY 4.0 + corpus NeuroAnatomy 3D';

export function normalizePartId(partId: string | null): string {
  const id = (partId || '').toLowerCase().replace(/_(izq|der|left|right)$/, '');
  if (!id) return '';

  const exactKeys = [
    'craneo', 'columna_vertebral', 'torax_costillas', 'humero', 'femur',
    'deltoides', 'pectoral_mayor', 'biceps_braquial', 'abdominales', 'cuadriceps',
    'hueso_general', 'musculo_general', 'sistema_nervioso_general',
    'cerebro_encefalo', 'medula_espinal', 'plexo_braquial', 'nervio_ciatico',
  ];
  if (exactKeys.includes(id)) return id;

  const aliases: Array<[RegExp, string]> = [
    [/frontal|parietal|occipital|temporal|sphenoid|etmoid|esfenoides|etmoides|mandib|maxil|craneo|skull/, 'craneo'],
    [/columna|vertebr/, 'columna_vertebral'],
    [/medula|espinal|spinal/, 'medula_espinal'],
    [/torax|costill|rib/, 'torax_costillas'],
    [/humero|radio|cubito|forearm/, 'humero'],
    [/femur/, 'femur'],
    [/deltoid/, 'deltoides'],
    [/pectoral/, 'pectoral_mayor'],
    [/biceps/, 'biceps_braquial'],
    [/abdominal|recto_abd/, 'abdominales'],
    [/cuadriceps|quadriceps/, 'cuadriceps'],
    [/cerebr|encefal|brain/, 'cerebro_encefalo'],
    [/ciatic|isquiatic/, 'nervio_ciatico'],
    [/plexo|brachial/, 'plexo_braquial'],
    [/nervio|nerve/, 'sistema_nervioso_general'],
  ];

  for (const [pattern, key] of aliases) {
    if (pattern.test(id)) return key;
  }
  return id;
}

export const EXAM_BANK: Record<string, ExamQuestion[]> = {
  craneo: [
    {
      id: 'craneo_1',
      question: 'La sutura coronal une los huesos:',
      options: ['Frontal y parietal', 'Parietales derecho e izquierdo', 'Parietal y occipital', 'Parietal y temporal'],
      answer: 0,
      explanation: 'La sutura coronal separa el hueso frontal de los dos huesos parietales.',
    },
    {
      id: 'craneo_2',
      question: '¿Qué hueso del cráneo está atravesado por los foramenes oval, redondo y espinoso?',
      options: ['Temporal', 'Etmoides', 'Esfenoides', 'Occipital'],
      answer: 2,
      explanation: 'El ala mayor del esfenoides contiene el foramen oval, el foramen redondo y el foramen espinoso.',
    },
    {
      id: 'craneo_3',
      question: '¿Qué hueso contribuye con un proceso que se une al cigomático para formar el arco cigomático?',
      options: ['Maxilar', 'Temporal', 'Esfenoides', 'Frontal'],
      answer: 1,
      explanation: 'El proceso cigomático del hueso temporal se articula con el hueso cigomático.',
    },
    {
      id: 'craneo_4',
      question: 'En una fractura desfavorable del cuerpo de la mandíbula, ¿qué desplazamiento es esperable?',
      options: [
        'Fragmento anterior desplazado hacia abajo por el digástrico',
        'Fragmento posterior desplazado hacia delante por el pterigoideo lateral',
        'Fragmento anterior desplazado hacia atrás por el temporal',
        'Fragmento posterior desplazado hacia dentro por el pterigoideo medial',
      ],
      answer: 0,
      explanation: 'El digástrico tracciona el fragmento anterior hacia abajo y atrás.',
    },
  ],
  columna_vertebral: [
    {
      id: 'columna_1',
      question: 'Las raíces dorsales de todos los nervios espinales contienen:',
      options: ['Procesos neuronales sensitivos', 'Procesos sensitivos y autónomos', 'Procesos motores', 'Procesos motores y autónomos'],
      answer: 0,
      explanation: 'La raíz dorsal es sensitiva; la rama ventral contiene fibras motoras y autónomas.',
    },
    {
      id: 'columna_2',
      question: 'En una lesión medular a nivel de C6, ¿qué patrón respiratorio se espera?',
      options: [
        'Requiere ventilación mecánica',
        'Solo puede respirar en silencio con respiración diafragmática',
        'No es posible predecir el efecto',
        'La respiración permanece normal',
      ],
      answer: 1,
      explanation: 'El diafragma se preserva (C3-C5), pero la musculatura intercostal queda parcialmente afectada.',
    },
    {
      id: 'columna_3',
      question: '¿Dónde decusan las vías motoras voluntarias finas en el sistema nervioso central?',
      options: ['En la médula espinal', 'En los ganglios sensitivos', 'En las pirámides del bulbo', 'En el cerebelo'],
      answer: 2,
      explanation: 'La mayoría de las fibras corticospinales se cruzan en la decusación de las pirámides bulbares.',
    },
  ],
  torax_costillas: [
    {
      id: 'torax_1',
      question: 'La caja torácica es una unidad estructural esencial para:',
      options: ['Alimentación', 'Menstruación', 'Cognición', 'Respiración'],
      answer: 3,
      explanation: 'La caja torácica protege los órganos torácicos y permite los movimientos ventilatorios.',
    },
    {
      id: 'torax_2',
      question: 'Respecto a la costilla, el nervio intercostal correspondiente se sitúa:',
      options: [
        'Profundo al borde superior',
        'Superficial al borde superior',
        'Profundo al borde inferior',
        'Superficial al borde inferior',
      ],
      answer: 2,
      explanation: 'El haz neurovascular intercostal discurre en el surco costal, profundo al borde inferior.',
    },
    {
      id: 'torax_3',
      question: 'La cabeza de la sexta costilla se articula con:',
      options: [
        'Carilla inferior de T5 y carilla superior de T6',
        'Semifaceta inferior de T5 y carilla superior de T6',
        'Semifaceta inferior de T5 y semifaceta superior de T6',
        'Semifacetas superior e inferior de T6',
      ],
      answer: 2,
      explanation: 'Las costillas típicas se articulan con semifacetas adyacentes de dos vértebras torácicas.',
    },
  ],
  humero: [
    {
      id: 'humero_1',
      question: '¿Cómo se denomina el movimiento que acerca el antebrazo al cuerpo en el plano sagital?',
      options: ['Abducción', 'Eversión', 'Flexión', 'Pronación'],
      answer: 2,
      explanation: 'La flexión del codo reduce el ángulo entre el antebrazo y el brazo.',
    },
    {
      id: 'humero_2',
      question: 'Una fractura con el radio curvado sin desplazamiento y piel íntegra se denomina:',
      options: ['Cerrada, en tallo verde', 'Compleja, conminuta', 'Abierta, transversa', 'Abierta, espiral'],
      answer: 0,
      explanation: 'Es una fractura cerrada en tallo verde, típica del esqueleto infantil.',
    },
  ],
  femur: [
    {
      id: 'femur_1',
      question: '¿Qué hueso grande se encuentra superior a la rótula e inferior al isquion?',
      options: ['Calcáneo', 'Fémur', 'Sínfisis del pubis', 'Tibia'],
      answer: 1,
      explanation: 'El fémur es el hueso largo de la pierna que articula proximalmente con el acetábulo y distalmente con la tibia.',
    },
    {
      id: 'femur_2',
      question: 'Los osteoclastos:',
      options: [
        'Depositan hueso y derivan de células mesenquimales',
        'Reabsorben hueso y derivan de células mesenquimales',
        'Depositan hueso y derivan de monocitos',
        'Reabsorben hueso y derivan de monocitos',
      ],
      answer: 3,
      explanation: 'Los osteoclastos son células multinucleadas de origen monocítico encargadas de la resorción ósea.',
    },
  ],
  deltoides: [
    {
      id: 'deltoides_1',
      question: 'Al explorar el nervio accesorio en el triángulo posterior del cuello, se pide al paciente:',
      options: [
        'Extender el cuello contra resistencia',
        'Extender el cuello sin resistencia',
        'Elevar los hombros contra resistencia',
        'Elevar los hombros sin resistencia',
      ],
      answer: 2,
      explanation: 'El nervio accesorio inerva el trapecio; se evalúa elevando los hombros contra resistencia.',
    },
    {
      id: 'deltoides_2',
      question: 'La actividad de la corteza motora primaria produce:',
      options: [
        'Contracción bilateral de músculos antigravitatorios',
        'Contracción bilateral de la musculatura de los miembros',
        'Contracción ipsilateral del miembro',
        'Contracción contralateral del miembro',
      ],
      answer: 3,
      explanation: 'La decusación corticospinal hace que la corteza motora controle predominantemente el lado contralateral.',
    },
  ],
  pectoral_mayor: [
    {
      id: 'pectoral_1',
      question: '¿Qué músculo se origina en la primera costilla y se inserta en el tubérculo mayor del húmero?',
      options: ['Deltoides', 'Pectoral mayor', 'Bíceps braquial', 'Cuádriceps'],
      answer: 1,
      explanation: 'El pectoral mayor tiene origen esternal, costal y clavicular y se inserta en el tubérculo mayor.',
    },
    {
      id: 'pectoral_2',
      question: 'El músculo pectoral mayor participa principalmente en:',
      options: ['Extensión del codo', 'Aducción y rotación interna del hombro', 'Dorsiflexión del tobillo', 'Flexión del tronco'],
      answer: 1,
      explanation: 'Sus fibras ajustan el brazo hacia el tronco y giran internamente el húmero.',
    },
  ],
  biceps_braquial: [
    {
      id: 'biceps_1',
      question: '¿Qué movimiento realiza principalmente el bíceps braquial?',
      options: ['Extensión del codo', 'Flexión del codo y supinación', 'Abducción del hombro', 'Pronación del antebrazo'],
      answer: 1,
      explanation: 'El bíceps es flexor del codo y potente supinador del antebrazo.',
    },
    {
      id: 'biceps_2',
      question: '¿Qué sustancia facilita la transmisión del impulso nervioso al músculo?',
      options: ['Acetilcolina', 'Colecistokinina', 'Desoxirribosa', 'Oxitocina'],
      answer: 0,
      explanation: 'La acetilcolina es el neurotransmisor de la unión neuromuscular.',
    },
  ],
  abdominales: [
    {
      id: 'abdominales_1',
      question: 'La región abdominal situada justo por debajo del esternón se denomina:',
      options: ['Epigástrica', 'Hipocondríaca', 'Hipogástrica', 'Lumbar'],
      answer: 0,
      explanation: 'La región epigástrica se localiza entre los hipocondrios y por debajo del proceso xifoideo.',
    },
    {
      id: 'abdominales_2',
      question: 'El músculo recto del abdomen está contenido en la vaina de los músculos:',
      options: ['Oblicuos y transverso', 'Pectorales', 'Glúteos', 'Isquiotibiales'],
      answer: 0,
      explanation: 'La vaina del recto se forma con las aponevroses de los músculos anchos del abdomen.',
    },
  ],
  cuadriceps: [
    {
      id: 'cuadriceps_1',
      question: 'El cuádriceps femoral actúa principalmente como:',
      options: ['Flexor de rodilla', 'Extensor de rodilla', 'Rotador externo de cadera', 'Flexor plantar'],
      answer: 1,
      explanation: 'El cuádriceps es el principal extensor de la rodilla través del tendón rotuliano.',
    },
    {
      id: 'cuadriceps_2',
      question: 'Si un nervio motor periférico no regenera, tras unos 6 meses el músculo presenta:',
      options: ['Parálisis espástica', 'Parálisis flácida', 'Atrofia', 'Contractura'],
      answer: 2,
      explanation: 'La denervación sostenida produce atrofia muscular por pérdida de estimulación trófica.',
    },
  ],
  hueso_general: [
    {
      id: 'hueso_1',
      question: 'Los osteoclastos:',
      options: [
        'Depositan hueso y derivan de células mesenquimales',
        'Reabsorben hueso y derivan de células mesenquimales',
        'Depositan hueso y derivan de monocitos',
        'Reabsorben hueso y derivan de monocitos',
      ],
      answer: 3,
      explanation: 'Los osteoclastos resorben tejido óseo y proceden de precursores monocíticos.',
    },
    {
      id: 'hueso_2',
      question: 'La matriz orgánica del hueso está formada principalmente por:',
      options: ['Colágeno tipo I', 'Hidroxiapatita', 'Queratina', 'Elastina'],
      answer: 0,
      explanation: 'El colágeno tipo I aporta resistencia a la tracción; la hidroxiapatita aporta dureza.',
    },
  ],
  musculo_general: [
    {
      id: 'musculo_1',
      question: 'La unidad funcional contráctil del músculo esquelético es el:',
      options: ['Sarcómero', 'Nefrona', 'Alvéolo', 'Osteocito'],
      answer: 0,
      explanation: 'El sarcómero es la unidad contráctil limitada por discos Z.',
    },
    {
      id: 'musculo_2',
      question: 'La acetilcolina actúa principalmente en:',
      options: ['La unión neuromuscular', 'El disco intervertebral', 'La articulación sinovial', 'El tendón'],
      answer: 0,
      explanation: 'La acetilcolina transmite el impulso desde la motoneurona hasta la fibra muscular.',
    },
  ],
  cerebro_encefalo: [
    {
      id: 'encefalo_1',
      question: 'El punto de transmisión del impulso de una neurona a otra es la:',
      options: ['Dendrita', 'Célula glial', 'Sinapsis', 'Raíz ventral'],
      answer: 2,
      explanation: 'La sinapsis permite la comunicación entre neuronas.',
    },
    {
      id: 'encefalo_2',
      question: 'El nervio craneal relacionado con el sentido del olfato es el:',
      options: ['Abducens', 'Hipogloso', 'Olfatorio', 'Troclear'],
      answer: 2,
      explanation: 'El nervio olfatorio (I) conduce la información del epitelio olfatorio.',
    },
  ],
  medula_espinal: [
    {
      id: 'medula_1',
      question: 'Las raíces ventrales de los nervios espinales contienen fibras:',
      options: ['Sensitivas', 'Motoras', 'Solo autónomas', 'Solo sensitivas'],
      answer: 1,
      explanation: 'La raíz ventral eferente contiene axones motores somáticos y autónomos.',
    },
    {
      id: 'medula_2',
      question: 'Una lesión de la corteza motora izquierda afecta predominantemente a:',
      options: ['Los músculos del lado izquierdo', 'Los músculos del lado derecho', 'Solo al diafragma', 'Solo a los músculos faciales'],
      answer: 1,
      explanation: 'La decusación de las vías corticospinales explica el control contralateral.',
    },
  ],
  plexo_braquial: [
    {
      id: 'plexo_1',
      question: 'Las fibras simpáticas preganglionares salen del SNC con los nervios:',
      options: ['Cervicales', 'Torácicos', 'Lumbares', 'Sacros'],
      answer: 1,
      explanation: 'El sistema simpático es toracolumbar (T1-L2).',
    },
    {
      id: 'plexo_2',
      question: 'La parálisis flácida por denervación motora se debe a lesión de:',
      options: ['La motoneurona inferior', 'La corteza motora', 'El cerebelo', 'Los ganglios basales'],
      answer: 0,
      explanation: 'La lesión de la motoneurona inferior produce parálisis flácida y atrofia.',
    },
  ],
  nervio_ciatico: [
    {
      id: 'ciatico_1',
      question: 'El nervio ciático está formado por ramas de los plexos:',
      options: ['Braquial y cervical', 'Sacro y lumbar', 'Torácico y lumbar', 'Cervical y sacro'],
      answer: 1,
      explanation: 'El nervio ciático nace del plexo sacro con contribución del plexo lumbar.',
    },
    {
      id: 'ciatico_2',
      question: 'Una lesión del nervio ciático produce predominantemente:',
      options: [
        'Pérdida de fuerza en extensores de rodilla',
        'Pérdida de fuerza en flexores de rodilla y musculatura del miembro inferior',
        'Pérdida de movilidad de la mano',
        'Anestesia del pulgar',
      ],
      answer: 1,
      explanation: 'El ciático inerva los isquiotibiales y, vía sus ramas, gran parte del miembro inferior.',
    },
  ],
  sistema_nervioso_general: [
    {
      id: 'sistema_nervioso_1',
      question: 'La sinapsis es el punto donde:',
      options: [
        'Se genera el potencial de acción en el axón',
        'Un impulso pasa de una neurona a otra',
        'Se forma la vaina de mielina',
        'Se une el tendón al hueso',
      ],
      answer: 1,
      explanation: 'La sinapsis permite la transmisión del impulso entre neuronas o hacia un efector.',
    },
    {
      id: 'sistema_nervioso_2',
      question: 'La corteza motora primaria controla principalmente los movimientos:',
      options: ['Ipsilaterales', 'Contralaterales', 'Bilaterales simétricos', 'Solo del tronco'],
      answer: 1,
      explanation: 'La mayoría de las fibras corticospinales decusan en el bulbo raquídeo.',
    },
  ],
};

export function getExamsForPart(partId: string | null): ExamQuestion[] {
  const id = normalizePartId(partId);
  return EXAM_BANK[id] || EXAM_BANK['hueso_general'];
}

export interface LocalAnatomyDetail {
  id: string;
  name: string;
  latin_name: string;
  system_layer: string;
  classification: string;
  function: string;
  insertions_or_origin: string;
  innervation_or_blood_supply: string;
  biomechanics: string;
  clinical_relevance: string;
  common_pathologies: string[];
  source: string;
}

const LOCAL_DETAILS: Record<string, Omit<LocalAnatomyDetail, 'id'>> = {
  craneo: {
    name: 'Cráneo y macizo facial',
    latin_name: 'Cranium',
    system_layer: 'oseo',
    classification: 'Esqueleto axial',
    function: 'Protege el encéfalo, cerebelo, tronco encefálico y órganos sensoriales; sostiene la masticación y da inserción anatómica a la musculatura facial y cervical.',
    insertions_or_origin: 'Neurocráneo: frontal, parietales, temporales, occipital, esfenoides y etmoides. Viscerocráneo: maxilares, mandíbula, cigomáticos, nasales, lagrimales, palatinos y vómer. Suturas coronal, sagital, lambdoidea y escamosa.',
    innervation_or_blood_supply: 'Inervación sensitiva mediante nervio trigémino, facial, glosofaríngeo, vago y accesorio; irrigación mediante arterias carótidas internas y externas.',
    biomechanics: 'Los pilares nasofrontal y cigomático transmiten y amortiguan las fuerzas oclusales de la masticación hacia la base craneal.',
    clinical_relevance: 'Traumatismo craneoencefálico, fracturas de base de cráneo, fracturas mandibulares y disfunción de la articulación temporomandibular.',
    common_pathologies: ['Traumatismo craneoencefálico', 'Fractura de base de cráneo', 'Fractura mandibular'],
    source: 'sistema_oseo.md',
  },
  columna_vertebral: {
    name: 'Columna vertebral',
    latin_name: 'Columna vertebralis',
    system_layer: 'oseo',
    classification: 'Esqueleto axial',
    function: 'Sostiene el eje axial, protege la médula espinal y permite el paso de los nervios espinales por los agujeros de conjunción.',
    insertions_or_origin: '33 vértebras: 7 cervicales, 12 torácicas, 5 lumbares, 5 sacras fusionadas y 4 coccígeas. Discos intervertebrales con anillo fibroso y núcleo pulposo; curvaturas cervical, torácica, lumbar y sacra.',
    innervation_or_blood_supply: 'Ramas dorsales y ventrales de los nervios espinales; irrigación segmentaria procedente de arterias espinales anteriores y posteriores.',
    biomechanics: 'Transmite cargas hacia la pelvis y amortigua impactos mediante la redistribución hidráulica de presión en los discos intervertebrales.',
    clinical_relevance: 'Hernia discal lumbar L4-L5 y L5-S1, espondilolistesis, escoliosis y fracturas por aplastamiento osteoporótico.',
    common_pathologies: ['Hernia discal lumbar', 'Espondilolistesis', 'Escoliosis', 'Fractura osteoporótica'],
    source: 'sistema_oseo.md',
  },
  torax_costillas: {
    name: 'Tórax óseo y costillas',
    latin_name: 'Thorax',
    system_layer: 'oseo',
    classification: 'Esqueleto axial',
    function: 'Protege corazón, grandes vasos, pulmones y esófago, y posibilita la ventilación mediante el movimiento de la jaula osteocartilaginosa.',
    insertions_or_origin: '12 pares de costillas: 7 verdaderas, 3 falsas y 2 flotantes. Esternón con manubrio, cuerpo y apófisis xifoides; ángulo de Louis en T4-T5.',
    innervation_or_blood_supply: 'Nervios intercostales en el surco costal, por debajo del borde inferior de cada costilla; irrigación de arterias intercostales.',
    biomechanics: 'Movimiento en brazo de bomba que aumenta el diámetro anteroposterior y en asa de balde que aumenta el diámetro transversal.',
    clinical_relevance: 'Fracturas costales, tórax inestable o volet costal con respiración paradójica, neumotórax y hemotórax por espículas óseas.',
    common_pathologies: ['Fractura costal', 'Volet costal', 'Neumotórax', 'Hemotórax'],
    source: 'sistema_oseo.md',
  },
  humero: {
    name: 'Húmero',
    latin_name: 'Humerus',
    system_layer: 'oseo',
    classification: 'Esqueleto apendicular',
    function: 'Actúa como brazo de palanca del miembro superior para posicionar antebrazo y mano en el espacio.',
    insertions_or_origin: 'Cabeza humeral, cuello anatómico, troquiter, troquín, corredera bicipital, tuberosidad deltoidea, tróclea, cóndilo, fosa olecraneana y epicóndilos.',
    innervation_or_blood_supply: 'Nervio axilar en el cuello quirúrgico, nervio radial en el canal de torsión y nervio musculocutáneo relacionado con la corredera bicipital; irrigación mediante arteria circunfleja humeral y braquial.',
    biomechanics: 'La articulación glenohumeral es una enartrosis multiaxial con el mayor rango de movilidad corporal; el codo permite flexión, extensión, pronación y supinación.',
    clinical_relevance: 'Fractura de cuello quirúrgico con riesgo para arteria circunfleja y nervio axilar, fractura diafisaria con mano caída por lesión radial, epicondilitis lateral y epitrocleítis.',
    common_pathologies: ['Fractura de cuello quirúrgico', 'Lesión del nervio radial', 'Epicondilitis lateral', 'Epitrocleítis'],
    source: 'sistema_oseo.md',
  },
  femur: {
    name: 'Fémur',
    latin_name: 'Femur',
    system_layer: 'oseo',
    classification: 'Esqueleto apendicular',
    function: 'Hueso más voluminoso y resistente del cuerpo; soporta hasta 30 veces el peso corporal durante la marcha y la carrera.',
    insertions_or_origin: 'Cabeza femoral con fóvea capitis, cuello anatómico con ángulo cérvico-diafisario de 125°-130°, trocánter mayor y menor, línea áspera, cóndilos y tróclea.',
    innervation_or_blood_supply: 'Arterias retinaculares para la cabeza femoral, arteria circunfleja femoral lateral para el trocánter mayor y ramas perforantes de la arteria femoral profunda.',
    biomechanics: 'Transmite cargas axiales desde el acetábulo hasta la meseta tibial y actúa como palanca para la marcha, el salto y la carrera.',
    clinical_relevance: 'Fracturas de cuello femoral con riesgo de necrosis avascular por interrupción de arterias retinaculares, fracturas diafisarias con pérdida hematica severa y artrosis femorotibial o femoropatelar.',
    common_pathologies: ['Fractura de cuello femoral', 'Necrosis avascular de cabeza femoral', 'Fractura diafisaria', 'Artrosis femoropatelar'],
    source: 'sistema_oseo.md',
  },
  deltoides: {
    name: 'Músculo deltoides',
    latin_name: 'Musculus deltoideus',
    system_layer: 'muscular',
    classification: 'Músculo esquelético',
    function: 'Abductor primario del brazo entre 15° y 90°; sus fibras anteriores flexionan y rotan medialmente, y las posteriores extienden y rotan lateralmente el hombro.',
    insertions_or_origin: 'Porción clavicular en el tercio lateral de la clavícula, porción acromial en el acromion y porción espinal en la espina de la escápula; se inserta en la tuberosidad deltoidea del húmero.',
    innervation_or_blood_supply: 'Nervio axilar o circunflejo, raíces C5-C6 del plexo braquial; irrigación de la arteria circunfleja humeral posterior y rama deltoidea de la toracoacromial.',
    biomechanics: 'Genera el momento de abducción del hombro tras la activación inicial del supraespinoso y estabiliza la cabeza humeral durante el levantamiento del brazo.',
    clinical_relevance: 'Lesión del nervio axilar por luxación anterior o fractura de cuello quirúrgico, con atrofia deltoidea y pérdida de sensibilidad lateral del hombro; bursitis subdeltoidea por fricción coracoacromial.',
    common_pathologies: ['Lesión del nervio axilar', 'Atrofia deltoidea', 'Bursitis subdeltoidea'],
    source: 'sistema_muscular.md',
  },
  pectoral_mayor: {
    name: 'Músculo pectoral mayor',
    latin_name: 'Musculus pectoralis major',
    system_layer: 'muscular',
    classification: 'Músculo esquelético',
    function: 'Aduce y rota medialmente el brazo; la cabeza clavicular flexiona el hombro y la porción esternocostal deprime el hombro y extiende desde la flexión completa.',
    insertions_or_origin: 'Cabeza clavicular en la mitad medial de la clavícula y cabeza esternocostal en el esternón y cartílagos costales 1 a 6; se inserta en la cresta del tubérculo mayor del húmero.',
    innervation_or_blood_supply: 'Nervios pectorales lateral y medial, C5-T1 del plexo braquial; irrigación de la rama pectoral de la arteria toracoacromial e intercostales anteriores.',
    biomechanics: 'Músculo accesorio inspiratorio en hipernea forzada cuando el húmero está fijado; potencia los movimientos de empuje y aducción horizontal del brazo.',
    clinical_relevance: 'Ruptura o avulsión tendinosa de la inserción humeral por sobrecarga resistida, con defecto palpable, asimetría de la línea axilar anterior y equimosis.',
    common_pathologies: ['Ruptura tendinosa', 'Avulsión de inserción humeral', 'Sobrecarga por press de banca'],
    source: 'sistema_muscular.md',
  },
  biceps_braquial: {
    name: 'Músculo bíceps braquial',
    latin_name: 'Musculus biceps brachii',
    system_layer: 'muscular',
    classification: 'Músculo esquelético',
    function: 'Principal supinador del antebrazo con el codo a 90° y potente flexor del codo; además coapta y estabiliza anteriormente la cabeza humeral.',
    insertions_or_origin: 'Cabeza corta en la apófisis coracoides y cabeza larga en el tubérculo supraglenoideo; se inserta en la tuberosidad bicipital del radio y en la aponeurosis bicipital.',
    innervation_or_blood_supply: 'Nervio musculocutáneo, raíces C5-C7; irrigación mediante ramas musculares de la arteria braquial.',
    biomechanics: 'Su trayecto intracapsular y su inserción radial permiten combinar flexión del codo con supinación, especialmente eficaz cuando el codo está flexionado.',
    clinical_relevance: 'Tendinopatía de la cabeza larga en la corredera bicipital, ruptura proximal con signo de Popeye y lesiones SLAP por desinserción del ancla tendinosa glenoidea.',
    common_pathologies: ['Tendinopatía de cabeza larga', 'Ruptura proximal', 'Lesión SLAP'],
    source: 'sistema_muscular.md',
  },
  abdominales: {
    name: 'Músculos abdominales y recto del abdomen',
    latin_name: 'Musculus rectus abdominis',
    system_layer: 'muscular',
    classification: 'Músculo esquelético',
    function: 'Flexiona el tronco, realiza retroversión pélvica e incrementa la presión intraabdominal para espiración forzada, defecación, micción y parto.',
    insertions_or_origin: 'Origen en cartílagos costales 5 a 7 y apófisis xifoides; inserción en cresta, espina y sínfisis del pubis. Presenta intersecciones tendinosas dentro de la vaina de los rectos y converge en la línea alba.',
    innervation_or_blood_supply: 'Nervios intercostales inferiores T7-T11 y nervio subcostal T12; irrigación de arterias epigástricas superior e inferior.',
    biomechanics: 'Estabiliza el core lumbo-pélvico y contrarresta la hiperlordosis lumbar mediante el control de la tensión de la línea alba y la fascia.',
    clinical_relevance: 'Diástasis de rectos por separación de la línea alba, frecuente en posparto o por presión intraabdominal crónica, y pubalgia del deportista por tracción recto-aductores.',
    common_pathologies: ['Diástasis de rectos', 'Pubalgia del deportista', 'Debilidad del core'],
    source: 'sistema_muscular.md',
  },
  cuadriceps: {
    name: 'Músculo cuádriceps femoral',
    latin_name: 'Musculus quadriceps femoris',
    system_layer: 'muscular',
    classification: 'Músculo esquelético',
    function: 'Extensor primario y más potente de la rodilla; el recto femoral colabora en la flexión de cadera y el vasto medial estabiliza dinámicamente la rótula.',
    insertions_or_origin: 'Recto femoral en la espina ilíaca anteroinferior, vasto lateral en el trocánter mayor y línea áspera, vasto medial en la línea áspera e intertrocantérea y vasto intermedio en la cara anterior del fémur; inserción común en rótula y tuberosidad tibial mediante tendón rotuliano.',
    innervation_or_blood_supply: 'Nervio femoral, raíces L2-L4 del plexo lumbar; irrigación de la arteria circunfleja femoral lateral y ramas perforantes de la femoral profunda.',
    biomechanics: 'Genera el momento extensor de rodilla necesario para marcha, carrera, salto y cuclillas; el vasto medial oblicuo previene la subluxación externa rotuliana.',
    clinical_relevance: 'Desgarros del recto femoral, tendinitis rotuliana o rodilla del saltador y síndrome de dolor femoropatelar por desbalance entre vasto medial y lateral.',
    common_pathologies: ['Desgarro del recto femoral', 'Tendinitis rotuliana', 'Dolor femoropatelar'],
    source: 'sistema_muscular.md',
  },
  cerebro_encefalo: {
    name: 'Encéfalo y hemisferios cerebrales',
    latin_name: 'Cerebrum',
    system_layer: 'nervioso',
    classification: 'Sistema nervioso central',
    function: 'Procesa información sensitiva, genera respuestas motoras voluntarias y coordina funciones cognitivas, emocionales y vegetativas esenciales.',
    insertions_or_origin: 'Corteza frontal con áreas motora y de Broca, parietal somatosensorial, temporal auditiva y de Wernicke, occipital visual, tronco encefálico con centros cardiorrespiratorios y cerebelo para coordinación y equilibrio.',
    innervation_or_blood_supply: 'Polígono de Willis con aporte de carótidas internas y sistema vertebrobasilar; drenaje venoso hacia los senos venosos durales.',
    biomechanics: 'La actividad de la corteza motora primaria produce contracción contralateral por decusación de las vías corticospinales en las pirámides bulbares.',
    clinical_relevance: 'Accidente cerebrovascular isquémico o hemorrágico, afasias de Broca y Wernicke, hemiplejía contralateral y hematomas epidural o subdural tras traumatismo craneoencefálico.',
    common_pathologies: ['Accidente cerebrovascular', 'Afasia de Broca', 'Afasia de Wernicke', 'Hematoma epidural'],
    source: 'sistema_nervioso.md',
  },
  medula_espinal: {
    name: 'Médula espinal',
    latin_name: 'Medulla spinalis',
    system_layer: 'nervioso',
    classification: 'Sistema nervioso central',
    function: 'Conduce impulsos sensitivos hacia el encéfalo y motores hacia el cuerpo, y organiza reflejos segmentarios y automáticos.',
    insertions_or_origin: 'Se extiende desde el foramen magnum hasta el disco L1-L2 en adultos; sustancia gris central con astas anteriores, posteriores y laterales, y sustancia blanca con cordones posterior, lateral y anterior.',
    innervation_or_blood_supply: 'Arterias espinales anterior y posteriores, con aporte segmentario de arterias radiculares; drenaje mediante plexos venosos espinales.',
    biomechanics: 'El haz corticoespinal lateral decusa en el bulbo y controla movimientos voluntarios finos; los cordones posteriores transmiten propiocepción, vibración y tacto epicrítico.',
    clinical_relevance: 'Sección medular completa con choque espinal e hiperreflexia, síndrome de Brown-Séquard, compresión de cono y cauda equina con anestesia en silla de montar e incontinencia.',
    common_pathologies: ['Sección medular completa', 'Síndrome de Brown-Sequard', 'Síndrome de cauda equina'],
    source: 'sistema_nervioso.md',
  },
  plexo_braquial: {
    name: 'Plexo braquial',
    latin_name: 'Plexus brachialis',
    system_layer: 'nervioso',
    classification: 'Sistema nervioso periférico',
    function: 'Proporciona control motor y sensibilidad a la cintura escapular y a todo el miembro superior.',
    insertions_or_origin: 'Raíces ventrales C5-T1, troncos superior, medio e inferior, divisiones anterior y posterior, y fascículos lateral, medial y posterior alrededor de la arteria axilar.',
    innervation_or_blood_supply: 'Ramas terminales: musculocutáneo, axilar, radial, mediano y ulnar; relación íntima con la arteria y vena axilares.',
    biomechanics: 'Coordina la activación de músculos fijadores del hombro y motores del brazo, antebrazo y mano para movimientos finos y de fuerza.',
    clinical_relevance: 'Parálisis de Erb-Duchenne por tracción C5-C6, parálisis de Klumpke por afectación C8-T1 y síndrome del desfiladero torácico por compresión neurovascular.',
    common_pathologies: ['Parálisis de Erb-Duchenne', 'Parálisis de Klumpke', 'Síndrome del desfiladero torácico'],
    source: 'sistema_nervioso.md',
  },
  nervio_ciatico: {
    name: 'Nervio ciático o isquiático',
    latin_name: 'Nervus ischiadicus',
    system_layer: 'nervioso',
    classification: 'Sistema nervioso periférico',
    function: 'Inerva los isquiotibiales y todos los músculos de pierna y pie, y aporta sensibilidad a la cara posterolateral de la pierna y al pie completo salvo el dermatoma safeno medial.',
    insertions_or_origin: 'Nace de las raíces ventrales L4-S3 del plexo sacro; emerge por el foramen isquiático mayor por debajo del piriforme y se divide en nervios tibial y fibular común en la fosa poplítea.',
    innervation_or_blood_supply: 'Ramas musculares directas y sus terminales tibial y peroneo; irrigación mediante vasos satélites de la arteria glútea inferior y poplítea.',
    biomechanics: 'Es el nervio periférico más voluminoso y largo, con hasta 2 cm de diámetro, y coordina la extensión de cadera, flexión de rodilla y movimientos del pie.',
    clinical_relevance: 'Ciatalgia lumbosacra por hernia discal L4-L5 o L5-S1 con signo de Lasègue positivo, síndrome del piriforme y neuropatía peronea con marcha en estepaje.',
    common_pathologies: ['Ciatalgia lumbosacra', 'Síndrome del piriforme', 'Pie caído peroneo'],
    source: 'sistema_nervioso.md',
  },
  hueso_general: {
    name: 'Tejido óseo',
    latin_name: 'Os',
    system_layer: 'oseo',
    classification: 'Tejido conectivo especializado',
    function: 'Proporciona soporte, protección, palancas para el movimiento, homeostasis mineral y hematopoyesis.',
    insertions_or_origin: 'Matriz orgánica de colágeno tipo I y matriz inorgánica de hidroxiapatita; osteoblastos, osteocitos y osteoclastos; hueso cortical, esponjoso, periostio y médula ósea.',
    innervation_or_blood_supply: 'Alta vascularización e inervación sensitiva del periostio, responsable del dolor intenso en fracturas y contusiones.',
    biomechanics: 'El colágeno resiste tracción y la hidroxiapatita resiste compresión; las trabéculas óseas disipan cargas axiales.',
    clinical_relevance: 'Fracturas, osteoporosis, osteoartritis y alteraciones del remodelado óseo.',
    common_pathologies: ['Fractura', 'Osteoporosis', 'Osteoartritis'],
    source: 'conceptos_fundamentales.md',
  },
  musculo_general: {
    name: 'Tejido muscular',
    latin_name: 'Musculus',
    system_layer: 'muscular',
    classification: 'Tejido contráctil',
    function: 'Convierte ATP en trabajo mecánico y calor para la locomoción, el tono postural, la termogénesis y el retorno venoso.',
    insertions_or_origin: 'Músculo estriado esquelético voluntario, estriado cardíaco autoexcitable y liso involuntario; unidad contráctil del sarcómero entre líneas Z.',
    innervation_or_blood_supply: 'Inervación somática del músculo esquelético y autónoma del músculo liso y cardíaco; la acetilcolina media la transmisión en la unión neuromuscular.',
    biomechanics: 'La despolarización libera calcio desde el retículo sarcoplásmico; el calcio expone los sitios de unión de actina y el ATP permite el ciclo de miosina.',
    clinical_relevance: 'Distensiones, desgarros, tendinopatías, denervación con atrofia y miopatías.',
    common_pathologies: ['Distensión muscular', 'Desgarro', 'Atrofia por denervación'],
    source: 'conceptos_fundamentales.md',
  },
  sistema_nervioso_general: {
    name: 'Sistema nervioso',
    latin_name: 'Systema nervosum',
    system_layer: 'nervioso',
    classification: 'Sistema de comunicación y control',
    function: 'Coordina funciones vitales, procesa información sensitiva, genera respuestas motoras y modula funciones cognitivas.',
    insertions_or_origin: 'Neurona con soma, dendritas y axón; células gliales como astrocitos, oligodendrocitos, células de Schwann y microglía.',
    innervation_or_blood_supply: 'Sistema nervioso central con encéfalo y médula espinal; sistema nervioso periférico con 12 pares de nervios craneales y 31 de nervios espinales.',
    biomechanics: 'Los potenciales de acción se propagan por el axón y se transmiten entre neuronas mediante sinapsis químicas o eléctricas.',
    clinical_relevance: 'Neuropatías, radiculopatías, ictus, traumatismos y enfermedades degenerativas del sistema nervioso.',
    common_pathologies: ['Neuropatía periférica', 'Radiculopatía', 'Accidente cerebrovascular'],
    source: 'conceptos_fundamentales.md',
  },
};

export function getLocalDetail(partId: string | null): LocalAnatomyDetail | null {
  const id = normalizePartId(partId);
  const detail = LOCAL_DETAILS[id];
  return detail ? { id, ...detail } : null;
}

export function buildLocalPartAnswer(partId: string | null): string | null {
  const detail = getLocalDetail(partId);
  if (!detail) return null;

  const pathologies = detail.common_pathologies.map((item) => `- ${item}`).join('\n');
  return (
    `### 🩺 ${detail.name}\n\n` +
    `**Nombre latino:** ${detail.latin_name} · **Capa:** ${detail.system_layer}\n\n` +
    `#### 🧩 Estructura y componentes\n${detail.insertions_or_origin}\n\n` +
    `#### ⚙️ Función y biomecánica\n${detail.function} ${detail.biomechanics}\n\n` +
    `#### 🧠 Inervación e irrigación\n${detail.innervation_or_blood_supply}\n\n` +
    `#### ⚠️ Relevancia clínica\n${detail.clinical_relevance}\n\n` +
    `**Patologías frecuentes:**\n${pathologies}\n\n` +
    `> ℹ️ Respuesta generada desde el corpus local de NeuroAnatomy 3D. El backend RAG ampliará el análisis cuando esté disponible.`
  );
}

@Injectable({
  providedIn: 'root',
})
export class AnatomyApiService {
  private http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8000/api';

  // Signals reactivos del estado global
  readonly selectedPart = signal<string | null>('craneo');
  readonly currentLayer = signal<string>('todos');
  readonly selectedDetail = signal<AnatomyDetail | null>(null);
  readonly chatHistory = signal<ChatMessage[]>([
    {
      id: 'welcome_1',
      sender: 'assistant',
      content:
        '### 🩺 Bienvenido al Asistente Clínico NeuroAnatomy 3D\n' +
        'Haz clic en cualquier estructura anatómica del maniquí 3D o formula preguntas clínicas sobre biomecánica, inervación o lesiones frecuentes.\n\n' +
        '> ⚠️ **Recordatorio:** Herramienta estrictamente pedagógica.',
      sources: ['sistema_oseo.md', 'sistema_muscular.md', 'sistema_nervioso.md'],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  readonly isLoading = signal<boolean>(false);
  readonly backendOnline = signal<boolean>(false);
  readonly llmProvider = signal<string>('mock');

  constructor() {
    this.checkHealth();
    this.fetchAnatomyDetail('craneo');
  }

  checkHealth(): void {
    this.http.get<HealthResponse>(`${this.baseUrl}/health`).pipe(
      tap((res) => {
        this.backendOnline.set(true);
        this.llmProvider.set(res.llm_provider);
      }),
      catchError((err) => {
        console.warn('Backend offline o inaccesible, operando en modo local:', err);
        this.backendOnline.set(false);
        return of(null);
      })
    ).subscribe();
  }

  fetchAnatomyDetail(partId: string): void {
    this.selectedPart.set(partId);
    this.http.get<AnatomyDetail>(`${this.baseUrl}/anatomy/${partId}`).pipe(
      tap((detail) => this.selectedDetail.set(detail)),
      catchError(() => {
        const local = getLocalDetail(partId);
        const fallbackDetail: AnatomyDetail = local
          ? {
              id: partId,
              name: local.name,
              latin_name: local.latin_name,
              system_layer: local.system_layer,
              classification: local.classification,
              function: local.function,
              insertions_or_origin: local.insertions_or_origin,
              innervation_or_blood_supply: local.innervation_or_blood_supply,
              biomechanics: local.biomechanics,
              clinical_relevance: local.clinical_relevance,
              common_pathologies: local.common_pathologies,
              quick_questions: [
                `¿Cuál es la función biomecánica de ${local.name}?`,
                `¿Cuáles son las lesiones más frecuentes de ${local.name}?`,
                `¿Qué inervación y vascularización recibe ${local.name}?`,
              ],
            }
          : {
              id: partId,
              name: partId.replace(/_/g, ' ').toUpperCase(),
              latin_name: `Structura ${partId}`,
              system_layer: this.inferLayer(partId),
              classification: 'Estructura anatómica mayor',
              function: 'Soporte funcional y biomecánico integral del aparato locomotor humano.',
              insertions_or_origin: 'Inserciones miotendinosas u óseas asociadas al segmento anatómico.',
              innervation_or_blood_supply: 'Ramas neurovasculares segmentarias.',
              biomechanics: 'Transmisión de vectores cinéticos y amortiguación de cargas mecánicas.',
              clinical_relevance: 'Estructura clave en medicina deportiva y traumatología general.',
              common_pathologies: ['Sobrecarga por sobreuso', 'Distensión traumática', 'Pinzamiento neurovascular'],
              quick_questions: [
                `¿Cuál es la función biomecánica de ${partId}?`,
                `¿Cuáles son las lesiones más frecuentes de ${partId}?`,
                `¿Qué inervación y vascularización recibe ${partId}?`,
              ],
            };
        this.selectedDetail.set(fallbackDetail);
        return of(fallbackDetail);
      })
    ).subscribe();
  }

  consultChat(question: string): void {
    if (!question.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      content: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    this.chatHistory.update((prev) => [...prev, userMsg]);
    this.isLoading.set(true);

    const payload = {
      selected_part: this.selectedPart(),
      system_layer: this.currentLayer(),
      question: question.trim(),
    };

    this.http.post<ConsultResponse>(`${this.baseUrl}/chat/consult`, payload).pipe(
      timeout(6000),
      tap((res) => {
        const botMsg: ChatMessage = {
          id: `bot_${Date.now()}`,
          sender: 'assistant',
          content: res.answer,
          sources: res.sources,
          related_structures: res.related_structures,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        this.chatHistory.update((prev) => [...prev, botMsg]);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        console.warn('Error conectando a API consult, aplicando fallback semántico:', err);
        const qLower = question.toLowerCase();
        let fallbackAnswer = '';
        let fallbackSources: string[] = [];
        let fallbackStructures: string[] = [];

        const localPart = getLocalDetail(this.selectedPart());
        const selectedPart = this.selectedPart();
        const questionMentionsPart = !!localPart && (
          qLower.includes(localPart.name.toLowerCase()) ||
          qLower.includes((selectedPart || '').replace(/_/g, ' ')) ||
          (selectedPart ? qLower.includes(normalizePartId(selectedPart)) : false) ||
          /función biomecánica|inervación|relevancia clínica|explícame|háblame de|estructura/.test(qLower)
        );

        if (localPart && questionMentionsPart) {
          fallbackAnswer = buildLocalPartAnswer(this.selectedPart()) || '';
          fallbackSources = [localPart.source];
          fallbackStructures = [localPart.id];
        } else if (qLower.includes('hueso') || qLower.includes('oste')) {
          fallbackAnswer =
            '### 🦴 ¿Qué es el hueso?\n\n' +
            '**El hueso** es un órgano rígido, dinámico y vivo constituido por **tejido conectivo mineralizado altamente vascularizado**. ' +
            'En el esqueleto adulto humano existen **206 huesos constantes**.\n\n' +
            '#### 🔬 Composición Histológica:\n' +
            '- **Matriz Orgánica (~35%)**: Compuesta fundamentalmente por colágeno tipo I que otorga flexibilidad y resistencia a tensiones mecánicas.\n' +
            '- **Matriz Inorgánica (~65%)**: Formada por sales minerales cristalizadas de hidroxiapatita cálcica $[Ca_{10}(PO_4)_6(OH)_2]$ que proporcionan dureza y resistencia a la compresión.\n' +
            '- **Osteoblastos**: Células que forman hueso sintetizando el osteoide.\n' +
            '- **Osteocitos**: Células maduras que actúan como mecanosensores del remodelado óseo continuo.\n' +
            '- **Osteoclastos**: Células multinucleadas responsables de la resorción y degradación ósea.\n\n' +
            '#### ⚡ Funciones Vitales:\n' +
            '1. **Sostén y Locomoción**: Andamiaje corporal y palancas óseas accionadas por la contracción muscular.\n' +
            '2. **Protección**: Resguardo hermético de órganos nobles (encéfalo en el cráneo, corazón/pulmones en el tórax).\n' +
            '3. **Metabolismo Mineral**: Es el mayor depósito corporal de calcio (99%) y fósforo (85%).\n' +
            '4. **Hematopoyesis**: Producción incesante de glóbulos rojos, blancos y plaquetas en la médula ósea roja.';
          fallbackSources = ['conceptos_fundamentales.md'];
          fallbackStructures = ['hueso_general'];
        } else if (qLower.includes('musculo') || qLower.includes('músculo')) {
          fallbackAnswer =
            '### 💪 ¿Qué es el músculo?\n\n' +
            '**El músculo** es un tejido biológico contráctil especializado que transforma energía química (ATP) en trabajo mecánico y movimiento. ' +
            'El cuerpo humano cuenta con más de **650 músculos esqueléticos** que conforman entre el 40% y el 50% de la masa corporal.\n\n' +
            '#### 🧬 Tipos de Músculo:\n' +
            '- **Estriado Esquelético**: Voluntario, inervado por el sistema nervioso somático.\n' +
            '- **Estriado Cardíaco (Miocardio)**: Involuntario, dotado de automatismo eléctrico.\n' +
            '- **Liso**: Involuntario, presente en paredes viscerales y vasculares.';
          fallbackSources = ['conceptos_fundamentales.md'];
          fallbackStructures = ['musculo_general'];
        } else if (qLower.includes('sistema nervioso') || qLower.includes('neurona') || qLower.includes('nervioso')) {
          fallbackAnswer =
            '### ⚡ ¿Qué es el sistema nervioso?\n\n' +
            '**El sistema nervioso** es una red electroquímica de comunicación y control que coordina las funciones vitales, ' +
            'procesa información sensitiva y genera respuestas motoras.\n\n' +
            '- **SNC:** encéfalo y médula espinal.\n' +
            '- **SNP:** nervios craneales y espinales con sus ganglios.\n' +
            '- **Neurona:** unidad funcional formada por soma, dendritas y axón.';
          fallbackSources = ['conceptos_fundamentales.md'];
          fallbackStructures = ['sistema_nervioso_general'];
        } else {
          const detail = this.selectedDetail();
          if (detail) {
            fallbackAnswer =
              `### 🩺 ${detail.name}\n\n` +
              `#### 🧩 Estructura\n${detail.insertions_or_origin}\n\n` +
              `#### ⚙️ Función y biomecánica\n${detail.function} ${detail.biomechanics}\n\n` +
              `#### 🧠 Inervación e irrigación\n${detail.innervation_or_blood_supply}\n\n` +
              `#### ⚠️ Relevancia clínica\n${detail.clinical_relevance}`;
            fallbackSources = [
              detail.system_layer === 'muscular'
                ? 'sistema_muscular.md'
                : detail.system_layer === 'nervioso'
                  ? 'sistema_nervioso.md'
                  : 'sistema_oseo.md',
            ];
          } else {
            fallbackAnswer =
              `### 🩺 Anatomía Humana\n\n` +
              `La pregunta *"${question}"* no tiene una ficha local asociada. ` +
              `Selecciona una estructura en el visor 3D para obtener un análisis anatómico detallado.`;
            fallbackSources = [];
          }
          fallbackStructures = selectedPart ? [selectedPart] : [];
        }

        const fallbackBotMsg: ChatMessage = {
          id: `bot_${Date.now()}`,
          sender: 'assistant',
          content: fallbackAnswer,
          sources: fallbackSources,
          related_structures: fallbackStructures,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        this.chatHistory.update((prev) => [...prev, fallbackBotMsg]);
        this.isLoading.set(false);
        return of(null);
      })
    ).subscribe();
  }

  selectPart(partId: string | null): void {
    if (partId) {
      this.fetchAnatomyDetail(partId);
    } else {
      this.selectedPart.set(null);
      this.selectedDetail.set(null);
    }
  }

  setLayer(layer: string): void {
    this.currentLayer.set(layer);
  }

  clearChat(): void {
    this.chatHistory.set([]);
  }

  private inferLayer(partId: string): string {
    const id = partId.toLowerCase();
    if (id.includes('nerve') || id.includes('ciatic') || id.includes('brain') || id.includes('radial') || id.includes('plexus') || id.includes('medul') || id.includes('encefal') || id.includes('sfg') || id.includes('mfg')) {
      return 'nervioso';
    }
    if (id.includes('organ') || id.includes('colon') || id.includes('adrenal') || id.includes('appendix') || id.includes('bile') || id.includes('heart') || id.includes('lung') || id.includes('liver') || id.includes('stomach') || id.includes('kidney')) {
      return 'organos';
    }
    if (id.includes('body') || id.includes('skin') || id.includes('tripo') || id.includes('cuerpo')) {
      return 'cuerpo';
    }
    if (id.includes('craneo') || id.includes('frontal') || id.includes('mandib') || id.includes('parietal') || id.includes('columna') || id.includes('torax') || id.includes('costilla') || id.includes('rib') || id.includes('humero') || id.includes('femur') || id.includes('tibia') || id.includes('pelvis') || id.includes('clavic')) {
      return 'oseo';
    }
    if (id.includes('biceps') || id.includes('cuadriceps') || id.includes('deltoid') || id.includes('pectoral') || id.includes('abdominal') || id.includes('rectus') || id.includes('frontalis') || id.includes('occipitalis') || id.includes('gastrocnemius')) {
      return 'muscular';
    }
    return 'general';
  }
}
