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
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  addOrganizationMemberSchema,
  AddOrganizationMemberDto,
  createOrganizationSchema,
  CreateOrganizationDto,
  organizationIdSchema,
  updateOrganizationMemberRoleSchema,
  UpdateOrganizationMemberRoleDto,
} from './dto/organization.dto';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { RealtimeService } from '../realtime/realtime.service';

@UseGuards(AuthGuard)
@Controller('api/organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createOrganizationSchema))
    dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(user.id, dto);
  }

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.findByUser(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(organizationIdSchema)) id: string,
  ) {
    return this.organizationsService.findOne(user.id, id);
  }

  @Get(':id/members')
  findMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(organizationIdSchema)) id: string,
  ) {
    return this.organizationsService.findMembers(user.id, id);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(organizationIdSchema)) id: string,
    @Body(new ZodValidationPipe(addOrganizationMemberSchema))
    dto: AddOrganizationMemberDto,
  ) {
    return this.organizationsService.addMember(user.id, id, dto);
  }

  @Patch(':id/members/:memberId')
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(organizationIdSchema)) id: string,
    @Param('memberId', new ZodValidationPipe(organizationIdSchema))
    memberId: string,
    @Body(new ZodValidationPipe(updateOrganizationMemberRoleSchema))
    dto: UpdateOrganizationMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(
      user.id,
      id,
      memberId,
      dto,
    );
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(organizationIdSchema)) id: string,
    @Param('memberId', new ZodValidationPipe(organizationIdSchema))
    memberId: string,
  ) {
    const projectIds = await this.organizationsService.removeMember(
      user.id,
      id,
      memberId,
    );
    await Promise.all(
      projectIds.map((projectId) =>
        this.realtime.reauthorizeProject(projectId),
      ),
    );
  }
}
