/**
 * Validation Certificate Generator
 * Creates official validation certificates for approved items
 */

export interface ValidationCertificate {
    id: string;
    itemId: string;
    itemType: string;
    entityId: string;
    entityName: string;

    // Certificate info
    certificateNumber: string;
    issuedAt: Date;
    validUntil: Date;

    // Validation summary
    validationType: 'human' | 'ai_assisted' | 'fully_automated';
    aiConfidence?: number;
    humanReviewers: Array<{
        name: string;
        role: string;
        decision: string;
        date: Date;
    }>;

    // Signatures
    digitalSignature: string;
    verificationCode: string;

    // Metadata
    institution: string;
    methodology: string;
    dataHash: string;
}

// In-memory certificate store
const certificates: Map<string, ValidationCertificate> = new Map();

/**
 * Generate a digital signature (simplified)
 */
function generateSignature(data: any): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `SIG-${Math.abs(hash).toString(16).toUpperCase().padStart(16, '0')}`;
}

/**
 * Generate verification code
 */
function generateVerificationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) code += '-';
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

/**
 * Generate a validation certificate
 */
export function generateCertificate(params: {
    itemId: string;
    itemType: string;
    entityId: string;
    entityName: string;
    aiConfidence?: number;
    humanReviewers: Array<{
        name: string;
        role: string;
        decision: string;
        date: Date;
    }>;
    institution?: string;
    methodology?: string;
    validityDays?: number;
}): ValidationCertificate {
    const id = `CERT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + (params.validityDays || 365));

    // Determine validation type
    let validationType: 'human' | 'ai_assisted' | 'fully_automated' = 'human';
    const hasHumanReview = params.humanReviewers.some(r => r.name !== 'Auto-Validation System');

    if (!hasHumanReview && params.aiConfidence !== undefined) {
        validationType = 'fully_automated';
    } else if (params.aiConfidence !== undefined && hasHumanReview) {
        validationType = 'ai_assisted';
    }

    const certificateData = {
        itemId: params.itemId,
        entityId: params.entityId,
        issuedAt: now.toISOString(),
    };

    const certificate: ValidationCertificate = {
        id,
        itemId: params.itemId,
        itemType: params.itemType,
        entityId: params.entityId,
        entityName: params.entityName,
        certificateNumber: `MVL-${now.getFullYear()}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
        issuedAt: now,
        validUntil,
        validationType,
        aiConfidence: params.aiConfidence,
        humanReviewers: params.humanReviewers,
        digitalSignature: generateSignature(certificateData),
        verificationCode: generateVerificationCode(),
        institution: params.institution || 'CMLRE - Centre for Marine Living Resources and Ecology',
        methodology: params.methodology || 'Standard validation protocol v1.0',
        dataHash: generateSignature({ entity: params.entityId, time: now }),
    };

    certificates.set(id, certificate);
    return certificate;
}

/**
 * Get certificate by ID
 */
export function getCertificate(id: string): ValidationCertificate | null {
    return certificates.get(id) || null;
}

/**
 * Get certificate by verification code
 */
export function getCertificateByCode(verificationCode: string): ValidationCertificate | null {
    return Array.from(certificates.values()).find(c => c.verificationCode === verificationCode) || null;
}

/**
 * Verify a certificate
 */
export function verifyCertificate(id: string): {
    valid: boolean;
    certificate: ValidationCertificate | null;
    issues: string[];
} {
    const cert = certificates.get(id);

    if (!cert) {
        return { valid: false, certificate: null, issues: ['Certificate not found'] };
    }

    const issues: string[] = [];

    // Check expiry
    if (new Date() > cert.validUntil) {
        issues.push(`Certificate expired on ${cert.validUntil.toISOString()}`);
    }

    // Verify signature (simplified)
    const expectedSig = generateSignature({
        itemId: cert.itemId,
        entityId: cert.entityId,
        issuedAt: cert.issuedAt.toISOString(),
    });

    if (cert.digitalSignature !== expectedSig) {
        issues.push('Digital signature mismatch - certificate may have been tampered');
    }

    return {
        valid: issues.length === 0,
        certificate: cert,
        issues,
    };
}

/**
 * Get certificates for an entity
 */
export function getEntityCertificates(entityId: string): ValidationCertificate[] {
    return Array.from(certificates.values())
        .filter(c => c.entityId === entityId)
        .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
}

/**
 * List all certificates
 */
export function listCertificates(filters?: {
    institution?: string;
    validationType?: string;
    onlyValid?: boolean;
    limit?: number;
}): ValidationCertificate[] {
    let result = Array.from(certificates.values());

    if (filters?.institution) {
        result = result.filter(c => c.institution.includes(filters.institution!));
    }
    if (filters?.validationType) {
        result = result.filter(c => c.validationType === filters.validationType);
    }
    if (filters?.onlyValid) {
        const now = new Date();
        result = result.filter(c => c.validUntil > now);
    }

    result.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());

    if (filters?.limit) {
        result = result.slice(0, filters.limit);
    }

    return result;
}

/**
 * Generate certificate HTML for printing
 */
export function generateCertificateHTML(id: string): string | null {
    const cert = certificates.get(id);
    if (!cert) return null;

    return `
<!DOCTYPE html>
<html>
<head>
  <title>Validation Certificate - ${cert.certificateNumber}</title>
  <style>
    body { font-family: 'Times New Roman', serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 3px double #003366; padding-bottom: 20px; }
    .logo { font-size: 24px; font-weight: bold; color: #003366; }
    .cert-number { font-size: 14px; color: #666; margin-top: 10px; }
    .title { font-size: 28px; color: #003366; margin: 30px 0; text-align: center; }
    .content { margin: 30px 0; line-height: 1.8; }
    .field { margin: 15px 0; }
    .label { font-weight: bold; color: #003366; }
    .verification { background: #f0f5ff; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0; }
    .code { font-family: monospace; font-size: 24px; letter-spacing: 4px; color: #003366; }
    .footer { border-top: 1px solid #ccc; padding-top: 20px; font-size: 12px; color: #666; }
    .signature { font-family: cursive; font-size: 18px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">🌊 MARLIN - Marine Living Resources Information Network</div>
    <div class="cert-number">Certificate No: ${cert.certificateNumber}</div>
  </div>
  
  <div class="title">VALIDATION CERTIFICATE</div>
  
  <div class="content">
    <p>This is to certify that the following item has been validated and verified:</p>
    
    <div class="field"><span class="label">Entity:</span> ${cert.entityName}</div>
    <div class="field"><span class="label">Type:</span> ${cert.itemType}</div>
    <div class="field"><span class="label">Validation Type:</span> ${cert.validationType.replace('_', ' ').toUpperCase()}</div>
    ${cert.aiConfidence ? `<div class="field"><span class="label">AI Confidence:</span> ${(cert.aiConfidence * 100).toFixed(1)}%</div>` : ''}
    <div class="field"><span class="label">Issued:</span> ${cert.issuedAt.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <div class="field"><span class="label">Valid Until:</span> ${cert.validUntil.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <div class="field"><span class="label">Institution:</span> ${cert.institution}</div>
    
    <div class="field"><span class="label">Reviewed By:</span></div>
    <ul>
      ${cert.humanReviewers.map(r => `<li>${r.name} (${r.role}) - ${r.decision}</li>`).join('')}
    </ul>
  </div>
  
  <div class="verification">
    <div>Verification Code</div>
    <div class="code">${cert.verificationCode}</div>
    <div style="font-size: 12px; margin-top: 10px;">Verify at: marlin.cmlre.gov.in/verify</div>
  </div>
  
  <div class="footer">
    <div class="field"><span class="label">Digital Signature:</span> ${cert.digitalSignature}</div>
    <div class="field"><span class="label">Data Hash:</span> ${cert.dataHash}</div>
    <p>This certificate was generated automatically by the MARLIN platform. It is valid only when verified through the official verification portal.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Get certificate statistics
 */
export function getCertificateStats(): {
    total: number;
    valid: number;
    expired: number;
    byType: Record<string, number>;
    byInstitution: Record<string, number>;
    recentlyIssued: number;
} {
    const all = Array.from(certificates.values());
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const byType: Record<string, number> = {};
    const byInstitution: Record<string, number> = {};

    all.forEach(c => {
        byType[c.validationType] = (byType[c.validationType] || 0) + 1;
        byInstitution[c.institution] = (byInstitution[c.institution] || 0) + 1;
    });

    return {
        total: all.length,
        valid: all.filter(c => c.validUntil > now).length,
        expired: all.filter(c => c.validUntil <= now).length,
        byType,
        byInstitution,
        recentlyIssued: all.filter(c => c.issuedAt >= thirtyDaysAgo).length,
    };
}
