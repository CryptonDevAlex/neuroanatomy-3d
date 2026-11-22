import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AnatomyApiService,
  EXAM_SOURCE,
  ExamQuestion,
  getExamsForPart,
} from '../../services/anatomy-api.service';

@Component({
  selector: 'app-clinical-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="w-full h-full flex flex-col bg-studio-900 border-l border-slate-800 text-slate-100 select-text overflow-hidden">
      <div class="p-3 border-b border-slate-800 bg-studio-850/70 backdrop-blur-md">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[9px] font-mono uppercase tracking-widest text-slate-500">Examen por estructura</p>
            <p class="text-xs font-semibold text-slate-200 truncate">{{ examTitle() }}</p>
          </div>
          <button
            (click)="toggleExam()"
            class="shrink-0 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all"
            [ngClass]="examOpen() ? 'border-amber-500/70 bg-amber-500/15 text-amber-300' : 'border-slate-700 bg-studio-800 text-slate-300 hover:border-amber-500/60 hover:text-amber-300'"
          >
            📝 Examen
          </button>
        </div>

        @if (examOpen()) {
          <div class="mt-3 rounded-xl border border-slate-700 bg-studio-900/80 p-3 space-y-2">
            @if (examFinished()) {
              <div class="text-center space-y-2 py-2">
                <p class="text-3xl font-bold text-cyan-300">{{ examScore() }}/{{ examQuestions().length }}</p>
                <p class="text-xs text-slate-400">Resultado del examen de {{ examTitle() }}</p>
                <button
                  (click)="restartExam()"
                  class="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/50 text-cyan-300 text-[11px] font-semibold hover:bg-cyan-500/25"
                >
                  Repetir examen
                </button>
              </div>
            } @else {
              @if (currentQuestion(); as question) {
              <div class="flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>Pregunta {{ examIndex() + 1 }} / {{ examQuestions().length }}</span>
                <span>{{ examScore() }} aciertos</span>
              </div>
              <p class="text-xs font-semibold text-slate-100 leading-relaxed">{{ question.question }}</p>
              <div class="space-y-1.5">
                @for (option of question.options; track $index) {
                  <button
                    (click)="answerExam($index)"
                    [disabled]="examAnswers()[question.id] !== undefined"
                    [ngClass]="getOptionClass($index, question)"
                    class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px] transition-all disabled:cursor-default"
                  >
                    <span class="font-mono text-[10px] opacity-70">{{ letters[$index] }}</span>
                    <span class="flex-1 text-left">{{ option }}</span>
                    @if (examAnswers()[question.id] === $index) {
                      <span>{{ $index === question.answer ? '✓' : '✕' }}</span>
                    }
                  </button>
                }
              </div>
              @if (examAnswers()[question.id] !== undefined) {
                <div class="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5 space-y-2">
                  <p class="text-[11px] text-slate-300 leading-relaxed">{{ question.explanation }}</p>
                  <div class="flex justify-end">
                    <button
                      (click)="nextQuestion()"
                      class="px-3 py-1 rounded-md bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[10px] font-semibold hover:bg-cyan-500/25"
                    >
                      {{ examIndex() + 1 >= examQuestions().length ? 'Ver resultado' : 'Siguiente →' }}
                    </button>
                  </div>
                </div>
              }
              }
            }
            <p class="text-[9px] text-slate-600 leading-tight">{{ examSource }}</p>
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
  readonly examSource = EXAM_SOURCE;
  readonly letters = ['A', 'B', 'C', 'D'];
  userInput = '';

  readonly examOpen = signal(false);
  readonly examIndex = signal(0);
  readonly examAnswers = signal<Record<string, number>>({});
  readonly examFinished = signal(false);
  readonly examQuestions = computed(() => getExamsForPart(this.anatomyService.selectedPart()));
  readonly currentQuestion = computed(() => this.examQuestions()[this.examIndex()] ?? null);
  readonly examTitle = computed(() => (this.anatomyService.selectedPart() || 'Anatomía general').replace(/_/g, ' '));
  readonly examScore = computed(() =>
    this.examQuestions().reduce(
      (score, question) => score + (this.examAnswers()[question.id] === question.answer ? 1 : 0),
      0
    )
  );

  private lastExamPart: string | null = null;

  constructor() {
    effect(() => {
      this.anatomyService.chatHistory();
      this.anatomyService.isLoading();
      const part = this.anatomyService.selectedPart();
      setTimeout(() => {
        this.scrollToBottom();
        if (part !== this.lastExamPart) {
          this.lastExamPart = part;
          this.resetExam();
        }
      }, 0);
    });
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.userInput.trim() || this.anatomyService.isLoading()) return;

    const query = this.userInput;
    this.userInput = '';
    this.anatomyService.consultChat(query);
  }

  toggleExam(): void {
    if (this.examOpen()) {
      this.examOpen.set(false);
      return;
    }
    this.resetExam();
    this.examOpen.set(true);
  }

  answerExam(index: number): void {
    const question = this.currentQuestion();
    if (!question || this.examAnswers()[question.id] !== undefined) return;
    this.examAnswers.update((answers) => ({ ...answers, [question.id]: index }));
  }

  nextQuestion(): void {
    if (this.examIndex() >= this.examQuestions().length - 1) {
      this.examFinished.set(true);
      return;
    }
    this.examIndex.update((index) => index + 1);
  }

  restartExam(): void {
    this.resetExam();
  }

  getOptionClass(index: number, question: ExamQuestion): string {
    const selected = this.examAnswers()[question.id];
    if (selected === undefined) {
      return 'border-slate-700 bg-studio-800 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-300';
    }
    if (index === question.answer) {
      return 'border-emerald-500/70 bg-emerald-950/30 text-emerald-200';
    }
    if (index === selected) {
      return 'border-red-500/70 bg-red-950/30 text-red-200';
    }
    return 'border-slate-800 bg-slate-950/40 text-slate-500';
  }

  selectRelated(partId: string): void {
    this.anatomyService.selectPart(partId);
    this.resetExam();
    this.anatomyService.consultChat(`Explícame la función y relación anatómica de ${partId}`);
  }

  formatMarkdown(content: string): string {
    let html = content
      .replace(/^### (.*$)/gim, '<h4 class="font-bold text-cyan-300 text-sm mt-2 mb-1">$1</h4>')
      .replace(/^#### (.*$)/gim, '<h5 class="font-semibold text-slate-100 text-xs mt-1.5 mb-0.5">$1</h5>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-slate-300">$1</em>')
      .replace(/^>\s*⚠️\s*(.*$)/gim, '<div class="p-2 rounded bg-amber-950/40 border border-amber-600/40 text-amber-300 text-[11px] my-1">⚠️ $1</div>')
      .replace(/^- (.*$)/gim, '<li class="ml-3 list-disc text-slate-300 text-xs py-0.5">$1</li>');
    return html;
  }

  private resetExam(): void {
    this.examIndex.set(0);
    this.examAnswers.set({});
    this.examFinished.set(false);
  }

  private scrollToBottom(): void {
    if (this.chatContainer) {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    }
  }
}
