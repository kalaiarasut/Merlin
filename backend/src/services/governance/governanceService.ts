/**
 * Governance Service
 * Institute management, project access, embargoes, and data sharing
 */

// ==================== TYPES ====================

export interface Institute {
    id: string;
    name: string;
    code: string;
    type: 'government' | 'academic' | 'research' | 'private';
    country: string;
    region: string;
    createdAt: Date;
    status: 'active' | 'suspended' | 'pending';
    settings: {
        dataIsolation: boolean;
        requireApprovalForSharing: boolean;
        defaultEmbargoMonths: number;
    };
    members: string[];
    admins: string[];
}

export interface Project {
    id: string;
    name: string;
    description: string;
    instituteId: string;
    createdAt: Date;
    startDate: Date;
    endDate?: Date;
    status: 'planning' | 'active' | 'completed' | 'archived';
    visibility: 'private' | 'institute' | 'public';
    members: Array<{
        userId: string;
        userName: string;
        role: 'lead' | 'researcher' | 'contributor' | 'viewer';
        addedAt: Date;
    }>;
    datasets: string[];
    embargo?: {
        enabled: boolean;
        endDate: Date;
        reason: string;
    };
}

export interface DataSharingAgreement {
    id: string;
    fromInstituteId: string;
    fromInstituteName: string;
    toInstituteId: string;
    toInstituteName: string;
    createdAt: Date;
    validUntil: Date;
    status: 'pending' | 'active' | 'expired' | 'revoked';
    scope: 'all_data' | 'specific_datasets' | 'specific_projects';
    datasetIds?: string[];
    projectIds?: string[];
    conditions: string;
    approvedBy?: string;
    approvedAt?: Date;
}

export type UserRole = 'admin' | 'approver' | 'researcher' | 'contributor' | 'viewer' | 'auditor';

export interface RolePermission {
    role: UserRole;
    permissions: string[];
    description: string;
}

// ==================== DATA STORES ====================

const institutes: Map<string, Institute> = new Map();
const projects: Map<string, Project> = new Map();
const sharingAgreements: Map<string, DataSharingAgreement> = new Map();

// Default role permissions
const rolePermissions: RolePermission[] = [
    { role: 'admin', permissions: ['*'], description: 'Full system access' },
    { role: 'approver', permissions: ['read', 'write', 'approve', 'reject', 'export'], description: 'Can approve/reject submissions' },
    { role: 'researcher', permissions: ['read', 'write', 'analyze', 'export'], description: 'Full research capabilities' },
    { role: 'contributor', permissions: ['read', 'write'], description: 'Can add and edit data' },
    { role: 'viewer', permissions: ['read'], description: 'Read-only access' },
    { role: 'auditor', permissions: ['read', 'audit'], description: 'Can view audit logs' },
];

// ==================== INSTITUTE MANAGEMENT ====================

export function createInstitute(params: {
    name: string;
    code: string;
    type: Institute['type'];
    country?: string;
    region?: string;
    adminUserId: string;
}): Institute {
    const id = `INST-${Date.now().toString(36).toUpperCase()}`;

    const institute: Institute = {
        id,
        name: params.name,
        code: params.code.toUpperCase(),
        type: params.type,
        country: params.country || 'India',
        region: params.region || 'National',
        createdAt: new Date(),
        status: 'active',
        settings: {
            dataIsolation: true,
            requireApprovalForSharing: true,
            defaultEmbargoMonths: 12,
        },
        members: [params.adminUserId],
        admins: [params.adminUserId],
    };

    institutes.set(id, institute);
    return institute;
}

export function getInstitute(id: string): Institute | null {
    return institutes.get(id) || null;
}

export function listInstitutes(filters?: { status?: string; type?: string }): Institute[] {
    let result = Array.from(institutes.values());

    if (filters?.status) {
        result = result.filter(i => i.status === filters.status);
    }
    if (filters?.type) {
        result = result.filter(i => i.type === filters.type);
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function updateInstituteSettings(id: string, settings: Partial<Institute['settings']>): Institute | null {
    const inst = institutes.get(id);
    if (!inst) return null;

    inst.settings = { ...inst.settings, ...settings };
    return inst;
}

export function addMemberToInstitute(instituteId: string, userId: string, isAdmin?: boolean): boolean {
    const inst = institutes.get(instituteId);
    if (!inst) return false;

    if (!inst.members.includes(userId)) {
        inst.members.push(userId);
    }
    if (isAdmin && !inst.admins.includes(userId)) {
        inst.admins.push(userId);
    }
    return true;
}

// ==================== PROJECT MANAGEMENT ====================

export function createProject(params: {
    name: string;
    description: string;
    instituteId: string;
    leadUserId: string;
    leadUserName: string;
    startDate?: Date;
    visibility?: Project['visibility'];
}): Project {
    const id = `PROJ-${Date.now().toString(36).toUpperCase()}`;

    const project: Project = {
        id,
        name: params.name,
        description: params.description,
        instituteId: params.instituteId,
        createdAt: new Date(),
        startDate: params.startDate || new Date(),
        status: 'active',
        visibility: params.visibility || 'private',
        members: [{
            userId: params.leadUserId,
            userName: params.leadUserName,
            role: 'lead',
            addedAt: new Date(),
        }],
        datasets: [],
    };

    projects.set(id, project);
    return project;
}

export function getProject(id: string): Project | null {
    return projects.get(id) || null;
}

export function listProjects(filters?: {
    instituteId?: string;
    status?: string;
    userId?: string;
}): Project[] {
    let result = Array.from(projects.values());

    if (filters?.instituteId) {
        result = result.filter(p => p.instituteId === filters.instituteId);
    }
    if (filters?.status) {
        result = result.filter(p => p.status === filters.status);
    }
    if (filters?.userId) {
        result = result.filter(p => p.members.some(m => m.userId === filters.userId));
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function addProjectMember(projectId: string, member: {
    userId: string;
    userName: string;
    role: 'lead' | 'researcher' | 'contributor' | 'viewer';
}): boolean {
    const project = projects.get(projectId);
    if (!project) return false;

    const existing = project.members.find(m => m.userId === member.userId);
    if (existing) {
        existing.role = member.role;
    } else {
        project.members.push({ ...member, addedAt: new Date() });
    }
    return true;
}

export function setProjectEmbargo(projectId: string, embargo: {
    enabled: boolean;
    endDate: Date;
    reason: string;
}): Project | null {
    const project = projects.get(projectId);
    if (!project) return null;

    project.embargo = embargo;
    return project;
}

export function addDatasetToProject(projectId: string, datasetId: string): boolean {
    const project = projects.get(projectId);
    if (!project) return false;

    if (!project.datasets.includes(datasetId)) {
        project.datasets.push(datasetId);
    }
    return true;
}

// ==================== DATA SHARING AGREEMENTS ====================

export function createSharingAgreement(params: {
    fromInstituteId: string;
    toInstituteId: string;
    validityMonths?: number;
    scope: DataSharingAgreement['scope'];
    datasetIds?: string[];
    projectIds?: string[];
    conditions: string;
}): DataSharingAgreement {
    const id = `DSA-${Date.now().toString(36).toUpperCase()}`;
    const fromInst = institutes.get(params.fromInstituteId);
    const toInst = institutes.get(params.toInstituteId);

    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + (params.validityMonths || 12));

    const agreement: DataSharingAgreement = {
        id,
        fromInstituteId: params.fromInstituteId,
        fromInstituteName: fromInst?.name || 'Unknown',
        toInstituteId: params.toInstituteId,
        toInstituteName: toInst?.name || 'Unknown',
        createdAt: new Date(),
        validUntil,
        status: 'pending',
        scope: params.scope,
        datasetIds: params.datasetIds,
        projectIds: params.projectIds,
        conditions: params.conditions,
    };

    sharingAgreements.set(id, agreement);
    return agreement;
}

export function approveSharingAgreement(id: string, approvedBy: string): DataSharingAgreement | null {
    const agreement = sharingAgreements.get(id);
    if (!agreement) return null;

    agreement.status = 'active';
    agreement.approvedBy = approvedBy;
    agreement.approvedAt = new Date();
    return agreement;
}

export function revokeSharingAgreement(id: string): boolean {
    const agreement = sharingAgreements.get(id);
    if (!agreement) return false;

    agreement.status = 'revoked';
    return true;
}

export function listSharingAgreements(filters?: {
    instituteId?: string;
    status?: string;
}): DataSharingAgreement[] {
    let result = Array.from(sharingAgreements.values());

    if (filters?.instituteId) {
        result = result.filter(a =>
            a.fromInstituteId === filters.instituteId ||
            a.toInstituteId === filters.instituteId
        );
    }
    if (filters?.status) {
        result = result.filter(a => a.status === filters.status);
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ==================== ACCESS CONTROL ====================

export function getRolePermissions(): RolePermission[] {
    return [...rolePermissions];
}

export function checkPermission(userRole: UserRole, permission: string): boolean {
    const roleConfig = rolePermissions.find(r => r.role === userRole);
    if (!roleConfig) return false;

    return roleConfig.permissions.includes('*') ||
        roleConfig.permissions.includes(permission);
}

export function canAccessProject(userId: string, projectId: string): {
    canAccess: boolean;
    role: string | null;
    reason: string;
} {
    const project = projects.get(projectId);
    if (!project) {
        return { canAccess: false, role: null, reason: 'Project not found' };
    }

    // Check if user is a member
    const membership = project.members.find(m => m.userId === userId);
    if (membership) {
        return { canAccess: true, role: membership.role, reason: 'Project member' };
    }

    // Check visibility
    if (project.visibility === 'public') {
        return { canAccess: true, role: 'viewer', reason: 'Public project' };
    }

    // Check institute membership for institute-visible projects
    if (project.visibility === 'institute') {
        const institute = institutes.get(project.instituteId);
        if (institute && institute.members.includes(userId)) {
            return { canAccess: true, role: 'viewer', reason: 'Institute member' };
        }
    }

    return { canAccess: false, role: null, reason: 'No access permission' };
}

// ==================== STATISTICS ====================

export function getGovernanceStats(): {
    institutes: { total: number; active: number; byType: Record<string, number> };
    projects: { total: number; active: number; byVisibility: Record<string, number> };
    agreements: { total: number; active: number; pending: number };
} {
    const allInst = Array.from(institutes.values());
    const allProj = Array.from(projects.values());
    const allAgreements = Array.from(sharingAgreements.values());

    const instByType: Record<string, number> = {};
    allInst.forEach(i => {
        instByType[i.type] = (instByType[i.type] || 0) + 1;
    });

    const projByVis: Record<string, number> = {};
    allProj.forEach(p => {
        projByVis[p.visibility] = (projByVis[p.visibility] || 0) + 1;
    });

    return {
        institutes: {
            total: allInst.length,
            active: allInst.filter(i => i.status === 'active').length,
            byType: instByType,
        },
        projects: {
            total: allProj.length,
            active: allProj.filter(p => p.status === 'active').length,
            byVisibility: projByVis,
        },
        agreements: {
            total: allAgreements.length,
            active: allAgreements.filter(a => a.status === 'active').length,
            pending: allAgreements.filter(a => a.status === 'pending').length,
        },
    };
}
