import { z } from 'zod';
import type { Ticket } from './types';
declare const importTicketSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    type: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    assignee: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodString>;
    epic: z.ZodOptional<z.ZodString>;
    estimate_hours: z.ZodOptional<z.ZodNumber>;
    labels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    depends_on: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    description: z.ZodOptional<z.ZodString>;
    acceptance_criteria: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    technical_notes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    definition_of_done: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    title: string;
    status?: string | undefined;
    epic?: string | undefined;
    type?: string | undefined;
    priority?: string | undefined;
    assignee?: string | undefined;
    role?: string | undefined;
    estimate_hours?: number | undefined;
    labels?: string[] | undefined;
    depends_on?: string[] | undefined;
    description?: string | undefined;
    acceptance_criteria?: string[] | undefined;
    technical_notes?: string[] | undefined;
    files?: string[] | undefined;
    definition_of_done?: string[] | undefined;
}, {
    id: string;
    title: string;
    status?: string | undefined;
    epic?: string | undefined;
    type?: string | undefined;
    priority?: string | undefined;
    assignee?: string | undefined;
    role?: string | undefined;
    estimate_hours?: number | undefined;
    labels?: string[] | undefined;
    depends_on?: string[] | undefined;
    description?: string | undefined;
    acceptance_criteria?: string[] | undefined;
    technical_notes?: string[] | undefined;
    files?: string[] | undefined;
    definition_of_done?: string[] | undefined;
}>;
export declare const ticketImportFileSchema: z.ZodObject<{
    meta: z.ZodObject<{
        project: z.ZodOptional<z.ZodString>;
        feature_key: z.ZodOptional<z.ZodString>;
        schema_version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        schema_version: string;
        project?: string | undefined;
        feature_key?: string | undefined;
    }, {
        schema_version: string;
        project?: string | undefined;
        feature_key?: string | undefined;
    }>;
    epic: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        goal: z.ZodOptional<z.ZodString>;
        owner: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        title: string;
        goal?: string | undefined;
        owner?: string | undefined;
    }, {
        id: string;
        title: string;
        goal?: string | undefined;
        owner?: string | undefined;
    }>>;
    tickets: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        type: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        assignee: z.ZodOptional<z.ZodString>;
        role: z.ZodOptional<z.ZodString>;
        epic: z.ZodOptional<z.ZodString>;
        estimate_hours: z.ZodOptional<z.ZodNumber>;
        labels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        depends_on: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        acceptance_criteria: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        technical_notes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        definition_of_done: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        title: string;
        status?: string | undefined;
        epic?: string | undefined;
        type?: string | undefined;
        priority?: string | undefined;
        assignee?: string | undefined;
        role?: string | undefined;
        estimate_hours?: number | undefined;
        labels?: string[] | undefined;
        depends_on?: string[] | undefined;
        description?: string | undefined;
        acceptance_criteria?: string[] | undefined;
        technical_notes?: string[] | undefined;
        files?: string[] | undefined;
        definition_of_done?: string[] | undefined;
    }, {
        id: string;
        title: string;
        status?: string | undefined;
        epic?: string | undefined;
        type?: string | undefined;
        priority?: string | undefined;
        assignee?: string | undefined;
        role?: string | undefined;
        estimate_hours?: number | undefined;
        labels?: string[] | undefined;
        depends_on?: string[] | undefined;
        description?: string | undefined;
        acceptance_criteria?: string[] | undefined;
        technical_notes?: string[] | undefined;
        files?: string[] | undefined;
        definition_of_done?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    meta: {
        schema_version: string;
        project?: string | undefined;
        feature_key?: string | undefined;
    };
    tickets: {
        id: string;
        title: string;
        status?: string | undefined;
        epic?: string | undefined;
        type?: string | undefined;
        priority?: string | undefined;
        assignee?: string | undefined;
        role?: string | undefined;
        estimate_hours?: number | undefined;
        labels?: string[] | undefined;
        depends_on?: string[] | undefined;
        description?: string | undefined;
        acceptance_criteria?: string[] | undefined;
        technical_notes?: string[] | undefined;
        files?: string[] | undefined;
        definition_of_done?: string[] | undefined;
    }[];
    epic?: {
        id: string;
        title: string;
        goal?: string | undefined;
        owner?: string | undefined;
    } | undefined;
}, {
    meta: {
        schema_version: string;
        project?: string | undefined;
        feature_key?: string | undefined;
    };
    tickets: {
        id: string;
        title: string;
        status?: string | undefined;
        epic?: string | undefined;
        type?: string | undefined;
        priority?: string | undefined;
        assignee?: string | undefined;
        role?: string | undefined;
        estimate_hours?: number | undefined;
        labels?: string[] | undefined;
        depends_on?: string[] | undefined;
        description?: string | undefined;
        acceptance_criteria?: string[] | undefined;
        technical_notes?: string[] | undefined;
        files?: string[] | undefined;
        definition_of_done?: string[] | undefined;
    }[];
    epic?: {
        id: string;
        title: string;
        goal?: string | undefined;
        owner?: string | undefined;
    } | undefined;
}>;
export type TicketImportFile = z.infer<typeof ticketImportFileSchema>;
export type ImportTicket = z.infer<typeof importTicketSchema>;
export type ValidationResult = {
    success: true;
    data: TicketImportFile;
} | {
    success: false;
    errors: string[];
};
export declare function validateTicketImport(raw: unknown): ValidationResult;
export interface ImportWarning {
    ticketId?: string;
    message: string;
}
export interface TicketUpdatePlan {
    /** Lokale Ticket-ID */
    id: string;
    updates: Partial<Ticket>;
}
export interface TicketDependencyPlan {
    /** Lokale Ticket-ID */
    ticketId: string;
    /** Lokale Ticket-IDs der Abhängigkeiten */
    dependsOnIds: string[];
}
export interface ImportPlan {
    inserts: Ticket[];
    updates: TicketUpdatePlan[];
    dependencies: TicketDependencyPlan[];
    warnings: ImportWarning[];
}
export interface ImportResult {
    success: boolean;
    canceled?: boolean;
    imported?: number;
    updated?: number;
    warnings?: ImportWarning[];
    errors?: string[];
}
export interface ImportContext {
    projectId: string;
    /** Externe ID → lokale Ticket-ID bereits vorhandener Tickets */
    existingByExternalId: Map<string, string>;
    agents: {
        id: string;
        name: string;
    }[];
    nextTicketNumber: number;
    now: string;
    generateId: () => string;
}
/** Rendert die strukturierten Felder als HTML — das Format, das das bestehende Ticket-Detail-UI (RichTextEditor) anzeigt. */
export declare function renderTicketDescriptionHtml(t: ImportTicket): string | undefined;
/**
 * Berechnet den Import-Plan: Upsert per externer ID (existiert → Update ohne
 * Status, sonst Insert), Epic als Ticket vom Typ "epic", depends_on als
 * Relation (nach Auflösung aller Tickets).
 */
export declare function planTicketImport(data: TicketImportFile, ctx: ImportContext): ImportPlan;
export {};
//# sourceMappingURL=ticketImport.d.ts.map