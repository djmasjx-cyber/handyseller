import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser('userId') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser('userId') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('me/organization')
  @UseGuards(JwtAuthGuard)
  async getOrganization(@CurrentUser('userId') userId: string) {
    return this.usersService.getOrganization(userId) ?? {};
  }

  @Put('me/organization')
  @UseGuards(JwtAuthGuard)
  async upsertOrganization(@CurrentUser('userId') userId: string, @Body() dto: UpsertOrganizationDto) {
    return this.usersService.upsertOrganization(userId, dto);
  }
}
