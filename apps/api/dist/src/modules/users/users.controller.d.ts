import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getMe(userId: string): Promise<{
        linkedToUserEmail: string | null;
        id: string;
        createdAt: Date;
        email: string | null;
        name: string | null;
        phone: string | null;
        role: import(".prisma/client").$Enums.Role;
    } | null>;
    updateMe(userId: string, dto: UpdateProfileDto): Promise<{
        linkedToUserEmail: string | null;
        id: string;
        createdAt: Date;
        email: string | null;
        name: string | null;
        phone: string | null;
        role: import(".prisma/client").$Enums.Role;
    } | {
        id: string;
        createdAt: Date;
        email: string | null;
        name: string | null;
        phone: string | null;
        role: import(".prisma/client").$Enums.Role;
        linkedToUserId: string | null;
    } | null>;
}
