import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
export declare class MaterialsController {
    private materialsService;
    constructor(materialsService: MaterialsService);
    findAll(userId: string): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        cost: import("@prisma/client/runtime/library").Decimal;
        unit: string;
    }[]>;
    create(userId: string, dto: CreateMaterialDto): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        cost: import("@prisma/client/runtime/library").Decimal;
        unit: string;
    }>;
}
