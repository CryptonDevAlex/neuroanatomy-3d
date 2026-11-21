import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnatomyViewerComponent } from './components/anatomy-viewer/anatomy-viewer.component';
import { ClinicalChatComponent } from './components/clinical-chat/clinical-chat.component';
import { AnatomyApiService } from './services/anatomy-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, AnatomyViewerComponent, ClinicalChatComponent],
  templateUrl: './app.component.html',
  styleUrls: [],
})
export class AppComponent {
  readonly anatomyService = inject(AnatomyApiService);
}
