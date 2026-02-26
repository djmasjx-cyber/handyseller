import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LoggerService } from '../../common/logger/logger.service';
export declare class AuthController {
    private authService;
    private logger;
    constructor(authService: AuthService, logger: LoggerService);
    register(dto: RegisterDto, req: Request, res: Response): Promise<{
        accessToken: string;
        user: {
            id: string;
            email: string;
            name: string | null;
        };
    }>;
    login(dto: LoginDto, req: Request, res: Response): Promise<{
        accessToken: string;
        user: {
            id: string;
            email: string | null;
            name: string | null;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    refresh(req: Request, res: Response): Promise<{
        accessToken: string;
    }>;
    logout(req: Request, res: Response): Promise<{
        success: boolean;
    }>;
}
