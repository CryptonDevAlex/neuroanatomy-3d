import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap } from 'rxjs';

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
        // Fallback local estructurado si el backend estuviera temporalmente detenido
        const fallbackDetail: AnatomyDetail = {
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
        console.warn('Error conectando a API consult, aplicando fallback:', err);
        const fallbackBotMsg: ChatMessage = {
          id: `bot_${Date.now()}`,
          sender: 'assistant',
          content:
            `### 🩺 Consulta sobre: ${(this.selectedPart() || 'Anatomía').replace(/_/g, ' ').toUpperCase()}\n\n` +
            `**Pregunta:** *"${question}"*\n\n` +
            `El análisis anatómico recuperado indica que esta región interviene críticamente en el sistema **${this.currentLayer().toUpperCase()}**. ` +
            `Los mecanismos patológicos frecuentes incluyen tensión miofascial, compresión o traumatismos directos.\n\n` +
            `*(Respuesta generada en modo de contingencia local del frontend).*`,
          sources: ['sistema_oseo.md', 'sistema_muscular.md'],
          related_structures: ['columna_vertebral', 'deltoides_izq'],
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
    if (id.includes('craneo') || id.includes('columna') || id.includes('torax') || id.includes('costilla') || id.includes('humero') || id.includes('femur')) {
      return 'oseo';
    }
    if (id.includes('biceps') || id.includes('cuadriceps') || id.includes('deltoides') || id.includes('pectoral') || id.includes('abdominal')) {
      return 'muscular';
    }
    if (id.includes('cerebro') || id.includes('medula') || id.includes('nervio') || id.includes('ciatico') || id.includes('plexo')) {
      return 'nervioso';
    }
    return 'general';
  }
}
