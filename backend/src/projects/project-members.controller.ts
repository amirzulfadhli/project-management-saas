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

@UseGuards(AuthGuard)
@Controller('api/projects/:projectId/members')
export class ProjectMembersController {
  constructor(private readonly projectMembersService: ProjectMembersService) {}

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
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectMemberIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(addProjectMemberSchema))
    dto: AddProjectMemberDto,
  ) {
    return this.projectMembersService.add(user.id, projectId, dto);
  }

  @Patch(':memberId')
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectMemberIdSchema))
    projectId: string,
    @Param('memberId', new ZodValidationPipe(projectMemberIdSchema))
    memberId: string,
    @Body(new ZodValidationPipe(updateProjectMemberRoleSchema))
    dto: UpdateProjectMemberRoleDto,
  ) {
    return this.projectMembersService.updateRole(
      user.id,
      projectId,
      memberId,
      dto,
    );
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
  }
}
