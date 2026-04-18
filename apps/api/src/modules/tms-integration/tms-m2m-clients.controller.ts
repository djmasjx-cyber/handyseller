import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateTmsM2mClientDto } from './dto/create-tms-m2m-client.dto';
import { RejectTmsM2mJwtGuard } from './guards/reject-tms-m2m-jwt.guard';
import { TmsM2mService } from './tms-m2m.service';

@Controller('tms/integration-clients')
@UseGuards(JwtAuthGuard, RejectTmsM2mJwtGuard)
export class TmsM2mClientsController {
  constructor(private readonly tmsM2m: TmsM2mService) {}

  @Get()
  list(@CurrentUser('userId') userId: string) {
    return this.tmsM2m.listForUser(userId);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateTmsM2mClientDto) {
    return this.tmsM2m.createForUser(userId, dto);
  }

  @Delete(':id')
  revoke(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tmsM2m.revoke(userId, id);
  }
}
