"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketImportFileSchema = void 0;
exports.validateTicketImport = validateTicketImport;
exports.renderTicketDescriptionHtml = renderTicketDescriptionHtml;
exports.planTicketImport = planTicketImport;
const zod_1 = require("zod");
// ── JSON Schema (v1.x) ───────────────────────────────────────────────────────
// Zod strips unknown keys by default — unbekannte Felder werden ignoriert,
// bekannte Felder werden strikt validiert.
const importTicketSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'Ticket-ID darf nicht leer sein'),
    title: zod_1.z.string().min(1, 'Titel darf nicht leer sein'),
    type: zod_1.z.string().optional(),
    priority: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    assignee: zod_1.z.string().optional(),
    role: zod_1.z.string().optional(),
    epic: zod_1.z.string().optional(),
    estimate_hours: zod_1.z.number().nonnegative().optional(),
    labels: zod_1.z.array(zod_1.z.string()).optional(),
    depends_on: zod_1.z.array(zod_1.z.string()).optional(),
    description: zod_1.z.string().optional(),
    acceptance_criteria: zod_1.z.array(zod_1.z.string()).optional(),
    technical_notes: zod_1.z.array(zod_1.z.string()).optional(),
    files: zod_1.z.array(zod_1.z.string()).optional(),
    definition_of_done: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.ticketImportFileSchema = zod_1.z.object({
    meta: zod_1.z.object({
        project: zod_1.z.string().optional(),
        feature_key: zod_1.z.string().optional(),
        schema_version: zod_1.z.string().regex(/^1\.\d+\.\d+$/, 'Nicht unterstützte Schema-Version (erwartet 1.x.x)'),
    }),
    epic: zod_1.z.object({
        id: zod_1.z.string().min(1),
        title: zod_1.z.string().min(1),
        goal: zod_1.z.string().optional(),
        owner: zod_1.z.string().optional(),
    }).optional(),
    tickets: zod_1.z.array(importTicketSchema).min(1, 'Mindestens ein Ticket erforderlich'),
});
function validateTicketImport(raw) {
    const result = exports.ticketImportFileSchema.safeParse(raw);
    if (result.success)
        return { success: true, data: result.data };
    const errors = result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `${path}: ${issue.message}`;
    });
    return { success: false, errors };
}
const STATUS_MAP = {
    open: 'open',
    todo: 'open',
    backlog: 'open',
    new: 'open',
    in_progress: 'in_progress',
    doing: 'in_progress',
    active: 'in_progress',
    in_review: 'in_progress',
    done: 'done',
    closed: 'done',
    resolved: 'done',
    completed: 'done',
};
const CATEGORY_VALUES = ['bug', 'feature', 'task', 'improvement', 'documentation', 'question', 'epic'];
function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function htmlSection(title, items, asCode = false) {
    if (!items || items.length === 0)
        return '';
    const lis = items.map((i) => `<li>${asCode ? `<code>${escapeHtml(i)}</code>` : escapeHtml(i)}</li>`).join('');
    return `<h3>${title}</h3><ul>${lis}</ul>`;
}
/** Rendert die strukturierten Felder als HTML — das Format, das das bestehende Ticket-Detail-UI (RichTextEditor) anzeigt. */
function renderTicketDescriptionHtml(t) {
    const parts = [];
    if (t.description) {
        parts.push(t.description.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join(''));
    }
    const metaBits = [];
    if (t.priority)
        metaBits.push(`Priorität: ${escapeHtml(t.priority)}`);
    if (t.role)
        metaBits.push(`Rolle: ${escapeHtml(t.role)}`);
    if (t.estimate_hours !== undefined)
        metaBits.push(`Aufwand: ${t.estimate_hours}h`);
    if (t.labels && t.labels.length > 0)
        metaBits.push(`Labels: ${t.labels.map(escapeHtml).join(', ')}`);
    if (metaBits.length > 0)
        parts.push(`<p><strong>${metaBits.join(' · ')}</strong></p>`);
    parts.push(htmlSection('Akzeptanzkriterien', t.acceptance_criteria));
    parts.push(htmlSection('Technische Hinweise', t.technical_notes));
    parts.push(htmlSection('Dateien', t.files, true));
    parts.push(htmlSection('Definition of Done', t.definition_of_done));
    const html = parts.filter(Boolean).join('');
    return html || undefined;
}
function mapStatus(raw, externalId, warnings) {
    if (!raw)
        return 'open';
    const mapped = STATUS_MAP[raw.toLowerCase()];
    if (!mapped) {
        warnings.push({ ticketId: externalId, message: `Unbekannter Status "${raw}" — auf "open" gesetzt` });
        return 'open';
    }
    return mapped;
}
function mapCategory(raw, externalId, warnings) {
    if (!raw)
        return 'task';
    const lower = raw.toLowerCase();
    if (CATEGORY_VALUES.includes(lower))
        return lower;
    warnings.push({ ticketId: externalId, message: `Unbekannter Typ "${raw}" — auf "task" gesetzt` });
    return 'task';
}
function matchAgent(assignee, ctx, externalId, warnings) {
    if (!assignee)
        return null;
    const match = ctx.agents.find((a) => a.name.toLowerCase() === assignee.toLowerCase());
    if (!match) {
        warnings.push({ ticketId: externalId, message: `Kein Projekt-Agent für Assignee "${assignee}" gefunden — Ticket bleibt unzugewiesen` });
        return null;
    }
    return match;
}
/**
 * Berechnet den Import-Plan: Upsert per externer ID (existiert → Update ohne
 * Status, sonst Insert), Epic als Ticket vom Typ "epic", depends_on als
 * Relation (nach Auflösung aller Tickets).
 */
function planTicketImport(data, ctx) {
    const warnings = [];
    const inserts = [];
    const updates = [];
    let ticketNumber = ctx.nextTicketNumber;
    const now = ctx.now;
    // Externe ID → lokale ID (vorhandene + neu geplante Tickets)
    const localIdByExternal = new Map(ctx.existingByExternalId);
    const upsert = (externalId, fresh, updatable) => {
        const existingId = localIdByExternal.get(externalId);
        if (existingId) {
            // Update: Status bewusst NICHT überschreiben
            updates.push({ id: existingId, updates: { ...updatable, updatedAt: now } });
            return existingId;
        }
        const localId = ctx.generateId();
        inserts.push({
            ...fresh,
            id: localId,
            ticketNumber: ticketNumber++,
            comments: [],
            createdAt: now,
        });
        localIdByExternal.set(externalId, localId);
        return localId;
    };
    // Epic als Ticket vom Typ "epic" anlegen/aktualisieren
    let epicLocalId;
    if (data.epic) {
        const epicDescParts = [];
        if (data.epic.goal)
            epicDescParts.push(`<p>${escapeHtml(data.epic.goal)}</p>`);
        if (data.epic.owner)
            epicDescParts.push(`<p><strong>Owner: ${escapeHtml(data.epic.owner)}</strong></p>`);
        const epicDescription = epicDescParts.join('') || undefined;
        epicLocalId = upsert(data.epic.id, {
            projectId: ctx.projectId,
            title: data.epic.title,
            description: epicDescription,
            status: 'open',
            category: 'epic',
            sortOrder: Date.parse(now),
            externalId: data.epic.id,
            updatedAt: now,
        }, {
            title: data.epic.title,
            description: epicDescription,
            category: 'epic',
            externalId: data.epic.id,
        });
    }
    for (const [index, t] of data.tickets.entries()) {
        const category = mapCategory(t.type, t.id, warnings);
        const agent = matchAgent(t.assignee, ctx, t.id, warnings);
        const description = renderTicketDescriptionHtml(t);
        let epicId;
        if (t.epic) {
            if (data.epic && t.epic === data.epic.id) {
                epicId = epicLocalId;
            }
            else {
                const known = localIdByExternal.get(t.epic);
                if (known) {
                    epicId = known;
                }
                else {
                    warnings.push({ ticketId: t.id, message: `Epic "${t.epic}" nicht gefunden — Ticket ohne Epic-Verknüpfung importiert` });
                }
            }
        }
        upsert(t.id, {
            projectId: ctx.projectId,
            title: t.title,
            description,
            status: mapStatus(t.status, t.id, warnings),
            category,
            assignedAgentLocalId: agent?.id,
            assignedAgentName: agent?.name,
            sortOrder: Date.parse(now) + index + 1,
            externalId: t.id,
            epicId,
            updatedAt: now,
        }, {
            title: t.title,
            description,
            category,
            assignedAgentLocalId: agent?.id,
            assignedAgentName: agent?.name,
            externalId: t.id,
            epicId,
        });
    }
    // depends_on erst nach Auflösung aller Tickets in Relationen übersetzen
    const dependencies = [];
    for (const t of data.tickets) {
        if (!t.depends_on || t.depends_on.length === 0)
            continue;
        const ticketLocalId = localIdByExternal.get(t.id);
        if (!ticketLocalId)
            continue;
        const resolved = [];
        for (const dep of t.depends_on) {
            const depLocalId = localIdByExternal.get(dep);
            if (!depLocalId) {
                warnings.push({ ticketId: t.id, message: `Abhängigkeit "${dep}" nicht gefunden — wird übersprungen` });
                continue;
            }
            if (depLocalId !== ticketLocalId)
                resolved.push(depLocalId);
        }
        dependencies.push({ ticketId: ticketLocalId, dependsOnIds: resolved });
    }
    return { inserts, updates, dependencies, warnings };
}
//# sourceMappingURL=ticketImport.js.map