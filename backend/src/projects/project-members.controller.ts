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
import {
  addProjectMemberSchema,
  AddProjectMemberDto,
  projectMemberIdSchema,
  updateProjectMemberRoleSchema,
  UpdateProjectMemberRoleDto,
} from './dto/project-member.dto';
import { ProjectMembersService } from './project-members.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';

@UseGuards(AuthGuard)
@Controller('api/projects/:projectId/members')
export class ProjectMembersController {
  constructor(
    private readonly projectMembersService: ProjectMembersService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectMemberIdSchema))
    projectId: string,
  ) {
    return this.projectMembersService.findAll(user.id, projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectMemberIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(addProjectMemberSchema))
    dto: AddProjectMemberDto,
  ) {
    const member = await this.projectMembersService.add(
      user.id,
      projectId,
      dto,
    );
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.PROJECT_MEMBER_ADDED,
      entity: 'project-member',
      entityId: member.id,
      actorId: user.id,
    });
    return member;
  }

  @Patch(':memberId')
  async updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectMemberIdSchema))
    projectId: string,
    @Param('memberId', new ZodValidationPipe(projectMemberIdSchema))
    memberId: string,
    @Body(new ZodValidationPipe(updateProjectMemberRoleSchema))
    dto: UpdateProjectMemberRoleDto,
  ) {
    const member = await this.projectMembersService.updateRole(
      user.id,
      projectId,
      memberId,
      dto,
    );
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.PROJECT_MEMBER_ROLE_CHANGED,
      entity: 'project-member',
      entityId: memberId,
      actorId: user.id,
    });
    return member;
  }

  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectMemberIdSchema))
    projectId: string,
    @Param('memberId', new ZodValidationPipe(projectMemberIdSchema))
    memberId: string,
  ) {
    await this.projectMembersService.remove(user.id, projectId, memberId);
    await this.realtime.reauthorizeProject(projectId);
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.PROJECT_MEMBER_REMOVED,
      entity: 'project-member',
      entityId: memberId,
      actorId: user.id,
    });
  }
}
