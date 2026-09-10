import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { environment } from '../config/environment';
import {
  GITHUB_APP_CALLBACK_URL,
  GITHUB_APP_CONFIG,
  GITHUB_FETCH,
  GITHUB_WEBHOOK_SECRET,
} from './github.constants';
import { GithubAppClient } from './github-app.client';
import { GithubAppController } from './github-app.controller';
import { GithubAppService } from './github-app.service';
import { GithubService } from './github.service';
import { GithubWebhooksController } from './github-webhooks.controller';
import { ProjectRepositoriesController } from './project-repositories.controller';

@Module({
  imports: [ActivitiesModule],
  controllers: [
    ProjectRepositoriesController,
    GithubWebhooksController,
    GithubAppController,
  ],
  providers: [
    GithubService,
    GithubAppService,
    GithubAppClient,
    {
      provide: GITHUB_WEBHOOK_SECRET,
      useValue: environment.githubWebhookSecret,
    },
    { provide: GITHUB_APP_CONFIG, useValue: environment.githubApp },
    { provide: GITHUB_FETCH, useValue: globalThis.fetch },
    {
      provide: GITHUB_APP_CALLBACK_URL,
      useValue: `${environment.backendUrl}/api/github/app/callback`,
    },
  ],
  exports: [GithubAppClient],
})
export class GithubModule {}
