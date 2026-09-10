import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';
import {
  CreateWikiPageDto,
  createWikiPageSchema,
  MoveWikiPageDto,
  moveWikiPageSchema,
  UpdateWikiPageDto,
  updateWikiPageSchema,
  wikiPageIdSchema,
  wikiProjectIdSchema,
} from './dto/wiki.dto';
import { WikiService } from './wiki.service';

@UseGuards(AuthGuard)
@Controller('api/projects/:projectId/wiki')
export class WikiController {
  constructor(
    private readonly wiki: WikiService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(wikiProjectIdSchema))
    projectId: string,
  ) {
    return this.wiki.list(user.id, projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(wikiProjectIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(createWikiPageSchema)) dto: CreateWikiPageDto,
  ) {
    const page = await this.wiki.create(user.id, projectId, dto);
    await this.publish(
      projectId,
      page.id,
      user.id,
      RealtimeEventType.WIKI_PAGE_CREATED,
    );
    return page;
  }

  @Get(':pageId')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(wikiProjectIdSchema))
    projectId: string,
    @Param('pageId', new ZodValidationPipe(wikiPageIdSchema)) pageId: string,
  ) {
    return this.wiki.findOne(user.id, projectId, pageId);
  }

  @Patch(':pageId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(wikiProjectIdSchema))
    projectId: string,
    @Param('pageId', new ZodValidationPipe(wikiPageIdSchema)) pageId: string,
    @Body(new ZodValidationPipe(updateWikiPageSchema)) dto: UpdateWikiPageDto,
  ) {
    const result = await this.wiki.update(user.id, projectId, pageId, dto);
    if (result.changed)
      await this.publish(
        projectId,
        pageId,
        user.id,
        RealtimeEventType.WIKI_PAGE_UPDATED,
      );
    return result.page;
  }

  @Patch(':pageId/move')
  async move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(wikiProjectIdSchema))
    projectId: string,
    @Param('pageId', new ZodValidationPipe(wikiPageIdSchema)) pageId: string,
    @Body(new ZodValidationPipe(moveWikiPageSchema)) dto: MoveWikiPageDto,
  ) {
    const result = await this.wiki.move(user.id, projectId, pageId, dto);
    if (result.changed)
      await this.publish(
        projectId,
        pageId,
        user.id,
        RealtimeEventType.WIKI_PAGE_MOVED,
      );
    return result.page;
  }

  @Delete(':pageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(wikiProjectIdSchema))
    projectId: string,
    @Param('pageId', new ZodValidationPipe(wikiPageIdSchema)) pageId: string,
  ) {
    await this.wiki.remove(user.id, projectId, pageId);
    await this.publish(
      projectId,
      pageId,
      user.id,
      RealtimeEventType.WIKI_PAGE_DELETED,
    );
  }

  private publish(
    projectId: string,
    entityId: string,
    actorId: string,
    type:
      | typeof RealtimeEventType.WIKI_PAGE_CREATED
      | typeof RealtimeEventType.WIKI_PAGE_UPDATED
      | typeof RealtimeEventType.WIKI_PAGE_DELETED
      | typeof RealtimeEventType.WIKI_PAGE_MOVED,
  ) {
    return this.realtime.publish({
      projectId,
      type,
      entity: 'wiki-page',
      entityId,
      actorId,
    });
  }
}
