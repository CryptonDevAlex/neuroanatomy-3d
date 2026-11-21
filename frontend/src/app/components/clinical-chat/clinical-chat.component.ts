import {
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnatomyApiService, ChatMessage } from '../../services/anatomy-api.service';

@Component({
  selector: 'app-clinical-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="w-full h-full flex flex-col bg-studio-900 border-l border-slate-800 text-slate-100 select-text overflow-hidden">
      <!-- Encabezado de la Ficha Anatómica Activa -->
      <div class="p-4 border-b border-slate-800 bg-studio-850/70 backdrop-blur-md">
        @if (anatomyService.selectedDetail(); as detail) {
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full" [ngClass]="getLayerDotClass(detail.system_layer)"></span>
                <span class="text-[11px] font-mono uppercase tracking-widest text-slate-400">
                  Sistema {{ detail.system_layer }}
                </span>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {{ detail.classification }}
              </span>
            </div>

            <div>
              <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                {{ detail.name }}
              </h2>
              <p class="text-xs italic text-cyan-400/90 font-serif">
                {{ detail.latin_name }}
              </p>
            </div>

            <!-- Ficha Técnica Resumida -->
            <p class="text-xs text-slate-300 leading-relaxed line-clamp-3">
              {{ detail.function }}
            </p>

            <!-- Patologías Frecuentes Chips -->
            @if (detail.common_pathologies.length) {
              <div class="pt-1">
                <span class="text-[10px] text-slate-400 uppercase font-mono block mb-1">Patologías Asociadas:</span>
                <div class="flex flex-wrap gap-1.5">
                  @for (pat of detail.common_pathologies; track pat) {
                    <button
                      (click)="askQuickQuestion('¿Qué implicancia clínica tiene ' + pat + ' en ' + detail.name + '?')"
                      class="text-[10px] px-2 py-0.5 rounded bg-red-950/40 border border-red-800/40 text-red-300 hover:bg-red-900/60 transition-all text-left"
                    >
                      ⚠️ {{ pat }}
                    </button>
                  }
                </div>
              </div>
            }

            <!-- Botones de Consulta Rápida -->
            <div class="pt-2 border-t border-slate-800/80">
              <span class="text-[10px] text-slate-400 uppercase font-mono block mb-1.5">Consultas Clínicas Rápidas:</span>
              <div class="flex flex-wrap gap-1.5">
                <button
                  (click)="askQuickQuestion('¿Cuál es la biomecánica y función principal de ' + detail.name + '?')"
                  class="text-[11px] px-2.5 py-1 rounded-lg bg-studio-800 border border-slate-700 hover:border-cyan-500/60 hover:text-cyan-300 transition-all flex items-center gap-1 text-slate-300"
                >
                  ⚡ Función & Biomecánica
                </button>
                <button
                  (click)="askQuickQuestion('¿Qué lesiones frecuentes y mecanismos traumáticos afectan a ' + detail.name + '?')"
                  class="text-[11px] px-2.5 py-1 rounded-lg bg-studio-800 border border-slate-700 hover:border-red-500/60 hover:text-red-300 transition-all flex items-center gap-1 text-slate-300"
                >
                  🩺 Lesiones Frecuentes
                </button>
                <button
                  (click)="askQuickQuestion('¿Qué inervación, irrigación e inserciones anatómicas corresponden a ' + detail.name + '?')"
                  class="text-[11px] px-2.5 py-1 rounded-lg bg-studio-800 border border-slate-700 hover:border-cyan-500/60 hover:text-cyan-300 transition-all flex items-center gap-1 text-slate-300"
                >
                  🧬 Inervación & Inserciones
                </button>
              </div>
            </div>
          </div>
        } @else {
          <!-- Estado Inicial sin Selección -->
          <div class="text-center py-6 text-slate-400">
            <div class="text-3xl mb-2">🦴</div>
            <p class="text-sm font-medium text-slate-200">Selecciona una estructura en el visor 3D</p>
            <p class="text-xs text-slate-500 mt-1">Haz clic sobre cualquier hueso, músculo o nervio para ver su ficha técnica.</p>
          </div>
        }
      </div>

      <!-- Historial de Chat Clínico con RAG -->
      <div #chatContainer class="flex-1 overflow-y-auto p-4 space-y-4">
        @for (msg of anatomyService.chatHistory(); track msg.id) {
          @if (msg.sender === 'user') {
            <!-- Mensaje Usuario -->
            <div class="flex justify-end">
              <div class="max-w-[85%] bg-cyan-600/20 border border-cyan-500/40 text-slate-100 rounded-2xl rounded-tr-none px-4 py-2.5 shadow-md">
                <p class="text-xs font-medium">{{ msg.content }}</p>
                <div class="text-[9px] text-cyan-400/80 text-right mt-1 font-mono">{{ msg.timestamp }}</div>
              </div>
            </div>
          } @else {
            <!-- Mensaje Asistente RAG -->
            <div class="flex justify-start">
              <div class="max-w-[90%] bg-studio-800/90 border border-slate-700/80 rounded-2xl rounded-tl-none p-3.5 shadow-xl space-y-2">
                <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono pb-1 border-b border-slate-700/50">
                  <span class="flex items-center gap-1 text-cyan-400 font-semibold">
                    <span>🩺</span> Asistente Clínico IA
                  </span>
                  <span>{{ msg.timestamp }}</span>
                </div>

                <!-- Contenido con Formato Educativo -->
                <div class="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans" [innerHTML]="formatMarkdown(msg.content)"></div>

                <!-- Fuentes Médicas Citadas -->
                @if (msg.sources && msg.sources.length) {
                  <div class="pt-2 border-t border-slate-700/50">
                    <span class="text-[9px] font-mono uppercase text-slate-400 block mb-1">📚 Fuentes indexadas en RAG:</span>
                    <div class="flex flex-wrap gap-1">
                      @for (src of msg.sources; track src) {
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300">
                          {{ src }}
                        </span>
                      }
                    </div>
                  </div>
                }

                <!-- Estructuras Correlacionadas Sugeridas -->
                @if (msg.related_structures && msg.related_structures.length) {
                  <div class="pt-1.5">
                    <span class="text-[9px] font-mono uppercase text-slate-400 block mb-1">🔗 Estructuras relacionadas:</span>
                    <div class="flex flex-wrap gap-1">
                      @for (rel of msg.related_structures; track rel) {
                        <button
                          (click)="selectRelated(rel)"
                          class="text-[10px] px-2 py-0.5 rounded bg-studio-900 border border-slate-700 hover:border-cyan-500/70 text-slate-300 hover:text-cyan-300 transition-all font-mono"
                        >
                          {{ rel }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        }

        <!-- Indicador de Carga / Generación RAG -->
        @if (anatomyService.isLoading()) {
          <div class="flex justify-start">
            <div class="bg-studio-800 border border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-3">
              <div class="w-3 h-3 rounded-full bg-cyan-400 animate-pulse"></div>
              <span class="text-xs text-slate-300 italic font-mono">Consultando base médica y motor RAG...</span>
            </div>
          </div>
        }
      </div>

      <!-- Barra de Entrada de Pregunta -->
      <div class="p-3 border-t border-slate-800 bg-studio-850">
        <form (submit)="onSubmit($event)" class="flex items-center gap-2">
          <input
            type="text"
            [(ngModel)]="userInput"
            name="query"
            placeholder="Pregunta sobre función, inervación o lesiones..."
            class="flex-1 bg-studio-900 text-xs text-slate-100 rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-500"
            [disabled]="anatomyService.isLoading()"
          />

          <button
            type="submit"
            [disabled]="anatomyService.isLoading() || !userInput.trim()"
            class="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-1"
          >
            <span>Enviar</span>
            <span>➤</span>
          </button>
        </form>

        <!-- Aviso Legal Clínico Fijo -->
        <div class="mt-2 text-[10px] text-slate-500 text-center leading-tight">
          ⚠️ <b>Aviso Educativo:</b> Uso exclusivo académico. No reemplaza el juicio clínico médico.
        </div>
      </div>
    </aside>
  `,
})
export class ClinicalChatComponent {
  @ViewChild('chatContainer') private chatContainer!: ElementRef<HTMLDivElement>;

  readonly anatomyService = inject(AnatomyApiService);
  userInput = '';

  constructor() {
    // Auto-scroll al recibir mensajes
    effect(() => {
      // Registrar dependencia reactiva
      const history = this.anatomyService.chatHistory();
      const loading = this.anatomyService.isLoading();
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.userInput.trim() || this.anatomyService.isLoading()) return;

    const query = this.userInput;
    this.userInput = '';
    this.anatomyService.consultChat(query);
  }

  askQuickQuestion(question: string): void {
    this.anatomyService.consultChat(question);
  }

  selectRelated(partId: string): void {
    this.anatomyService.selectPart(partId);
    this.anatomyService.consultChat(`Explícame la función y relación anatómica de ${partId}`);
  }

  formatMarkdown(content: string): string {
    // Parser seguro y simple para resaltar títulos, negritas y alertas
    let html = content
      .replace(/^### (.*$)/gim, '<h4 class="font-bold text-cyan-300 text-sm mt-2 mb-1">$1</h4>')
      .replace(/^#### (.*$)/gim, '<h5 class="font-semibold text-slate-100 text-xs mt-1.5 mb-0.5">$1</h5>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-slate-300">$1</em>')
      .replace(/^>\s*⚠️\s*(.*$)/gim, '<div class="p-2 rounded bg-amber-950/40 border border-amber-600/40 text-amber-300 text-[11px] my-1">⚠️ $1</div>')
      .replace(/^- (.*$)/gim, '<li class="ml-3 list-disc text-slate-300 text-xs py-0.5">$1</li>');
    return html;
  }

  getLayerDotClass(layer: string): string {
    switch (layer) {
      case 'oseo':
        return 'bg-slate-200';
      case 'muscular':
        return 'bg-red-500';
      case 'nervioso':
        return 'bg-cyan-400';
      default:
        return 'bg-slate-400';
    }
  }

  private scrollToBottom(): void {
    if (this.chatContainer) {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    }
  }
}
