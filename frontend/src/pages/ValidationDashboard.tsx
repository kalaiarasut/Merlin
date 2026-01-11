/**
 * Validation Dashboard - Scientific Validation Workflow UI
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea, Select } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import {
    Shield, CheckCircle, XCircle, Clock, AlertTriangle,
    FileCheck, Award, Settings, Search, Filter, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// API service
const validationApi = {
    getInfo: () => fetch(`${API_URL}/api/validation/info`).then(r => r.json()),
    getPending: (filters?: any) => {
        const params = new URLSearchParams(filters || {});
        return fetch(`${API_URL}/api/validation/pending?${params}`).then(r => r.json());
    },
    getStats: () => fetch(`${API_URL}/api/validation/stats`).then(r => r.json()),
    getThresholds: () => fetch(`${API_URL}/api/validation/thresholds`).then(r => r.json()),
    getCertificates: () => fetch(`${API_URL}/api/validation/certificates?limit=10`).then(r => r.json()),
    submitReview: (data: any) => fetch(`${API_URL}/api/validation/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).then(r => r.json()),
    updateThresholds: (data: any) => fetch(`${API_URL}/api/validation/thresholds`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).then(r => r.json()),
};

export default function ValidationDashboard() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'queue' | 'certificates' | 'settings'>('queue');
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [reviewForm, setReviewForm] = useState({ decision: 'approve', comments: '', confidence: 0.9 });

    // Queries
    const { data: infoData } = useQuery({ queryKey: ['validation-info'], queryFn: validationApi.getInfo });
    const { data: pendingData, refetch: refetchPending } = useQuery({ queryKey: ['validation-pending'], queryFn: () => validationApi.getPending() });
    const { data: statsData } = useQuery({ queryKey: ['validation-stats'], queryFn: validationApi.getStats });
    const { data: certsData } = useQuery({ queryKey: ['validation-certs'], queryFn: validationApi.getCertificates });
    const { data: thresholdsData } = useQuery({ queryKey: ['validation-thresholds'], queryFn: validationApi.getThresholds });

    // Mutations
    const reviewMutation = useMutation({
        mutationFn: (data: any) => validationApi.submitReview(data),
        onSuccess: () => {
            toast.success('Review submitted successfully');
            setSelectedItem(null);
            queryClient.invalidateQueries({ queryKey: ['validation-pending'] });
            queryClient.invalidateQueries({ queryKey: ['validation-stats'] });
        },
        onError: () => toast.error('Failed to submit review'),
    });

    const handleSubmitReview = () => {
        if (!selectedItem) return;
        reviewMutation.mutate({
            itemId: selectedItem.id,
            reviewerId: 'current-user',
            reviewerName: 'Current User',
            reviewerRole: 'reviewer',
            ...reviewForm,
            generateCertificate: reviewForm.decision === 'approve',
        });
    };

    const stats = statsData?.stats?.workflow || {};
    const items = pendingData?.items || [];
    const certificates = certsData?.certificates || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-5 h-5 text-ocean-500" />
                        <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Scientific Validation</span>
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-gray-100">Validation Dashboard</h1>
                    <p className="text-deep-500 dark:text-gray-400 mt-1">
                        Review and approve AI-assisted identifications and analyses
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refetchPending()}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard
                    title="Pending"
                    value={stats.pending || 0}
                    icon={<Clock className="w-5 h-5" />}
                />
                <StatCard
                    title="In Review"
                    value={stats.inReview || 0}
                    icon={<Search className="w-5 h-5" />}
                />
                <StatCard
                    title="Approved"
                    value={stats.approved || 0}
                    icon={<CheckCircle className="w-5 h-5" />}
                />
                <StatCard
                    title="Rejected"
                    value={stats.rejected || 0}
                    icon={<XCircle className="w-5 h-5" />}
                />
                <StatCard
                    title="Avg Review Time"
                    value={`${stats.avgReviewTime || 0}m`}
                    icon={<Clock className="w-5 h-5" />}
                />
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                {[
                    { id: 'queue', label: 'Validation Queue', icon: FileCheck },
                    { id: 'certificates', label: 'Certificates', icon: Award },
                    { id: 'settings', label: 'Thresholds', icon: Settings },
                ].map(tab => (
                    <Button
                        key={tab.id}
                        variant={activeTab === tab.id ? 'default' : 'ghost'}
                        onClick={() => setActiveTab(tab.id as any)}
                    >
                        <tab.icon className="w-4 h-4 mr-2" />
                        {tab.label}
                    </Button>
                ))}
            </div>

            {/* Queue Tab */}
            {activeTab === 'queue' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Items List */}
                    <div className="lg:col-span-2 space-y-4">
                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle className="text-lg">Pending Validations</CardTitle>
                                <CardDescription>{items.length} items awaiting review</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {items.length === 0 ? (
                                    <div className="text-center py-8 text-deep-500 dark:text-gray-400">
                                        <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p>No items pending validation</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {items.map((item: any) => (
                                            <div
                                                key={item.id}
                                                onClick={() => setSelectedItem(item)}
                                                className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedItem?.id === item.id
                                                    ? 'border-ocean-500 bg-ocean-50 dark:bg-ocean-900/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-ocean-300'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h4 className="font-medium text-deep-900 dark:text-gray-100">{item.entityName}</h4>
                                                        <p className="text-sm text-deep-500 dark:text-gray-400">{item.type}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <Badge variant={item.priority === 'high' ? 'destructive' : item.priority === 'critical' ? 'destructive' : 'secondary'}>
                                                            {item.priority}
                                                        </Badge>
                                                        {item.isAIGenerated && item.aiConfidence && (
                                                            <p className="text-xs mt-1 text-deep-500 dark:text-gray-400">
                                                                AI: {(item.aiConfidence * 100).toFixed(0)}%
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Review Panel */}
                    <div>
                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle className="text-lg">Review Panel</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {selectedItem ? (
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-deep-900 dark:text-gray-100">{selectedItem.entityName}</h4>
                                            <p className="text-sm text-deep-500 dark:text-gray-400">ID: {selectedItem.id}</p>
                                        </div>

                                        {selectedItem.isAIGenerated && (
                                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                                <div className="flex items-center gap-2">
                                                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                                                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">AI Generated</span>
                                                </div>
                                                <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                                                    Confidence: {(selectedItem.aiConfidence * 100).toFixed(1)}%
                                                </p>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium mb-1">Decision</label>
                                            <Select
                                                value={reviewForm.decision}
                                                onChange={(e) => setReviewForm(f => ({ ...f, decision: e.target.value }))}
                                            >
                                                <option value="approve">Approve</option>
                                                <option value="reject">Reject</option>
                                                <option value="request_changes">Request Changes</option>
                                            </Select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1">Comments</label>
                                            <Textarea
                                                value={reviewForm.comments}
                                                onChange={(e) => setReviewForm(f => ({ ...f, comments: e.target.value }))}
                                                placeholder="Review comments..."
                                                rows={3}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1">Your Confidence</label>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={1}
                                                step={0.1}
                                                value={reviewForm.confidence}
                                                onChange={(e) => setReviewForm(f => ({ ...f, confidence: parseFloat(e.target.value) }))}
                                            />
                                        </div>

                                        <Button
                                            className="w-full"
                                            variant={reviewForm.decision === 'approve' ? 'success' : reviewForm.decision === 'reject' ? 'destructive' : 'default'}
                                            onClick={handleSubmitReview}
                                            disabled={reviewMutation.isPending}
                                        >
                                            {reviewForm.decision === 'approve' ? (
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                            ) : reviewForm.decision === 'reject' ? (
                                                <XCircle className="w-4 h-4 mr-2" />
                                            ) : (
                                                <AlertTriangle className="w-4 h-4 mr-2" />
                                            )}
                                            Submit Review
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-deep-500 dark:text-gray-400">
                                        <FileCheck className="w-10 h-10 mx-auto mb-3 opacity-50" />
                                        <p>Select an item to review</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Certificates Tab */}
            {activeTab === 'certificates' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Validation Certificates</CardTitle>
                        <CardDescription>Recently issued validation certificates</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {certificates.length === 0 ? (
                            <div className="text-center py-8 text-deep-500 dark:text-gray-400">
                                <Award className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>No certificates issued yet</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {certificates.map((cert: any) => (
                                    <div key={cert.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h4 className="font-medium text-deep-900 dark:text-gray-100">{cert.entityName}</h4>
                                                <p className="text-sm text-deep-500 dark:text-gray-400">{cert.certificateNumber}</p>
                                                <p className="text-xs text-deep-400 dark:text-gray-500 mt-1">
                                                    Valid until: {new Date(cert.validUntil).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <Badge variant="outline">{cert.validationType}</Badge>
                                                <p className="text-xs mt-1 font-mono text-deep-500 dark:text-gray-400">
                                                    {cert.verificationCode}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Auto-Approval Thresholds</CardTitle>
                        <CardDescription>Configure confidence thresholds for automatic validation decisions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {thresholdsData?.thresholds && Object.entries(thresholdsData.thresholds).map(([key, value]: [string, any]) => (
                                <div key={key} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <h4 className="font-medium text-deep-900 dark:text-gray-100 capitalize mb-3">
                                        {key.replace('_', ' ')}
                                    </h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-deep-500 dark:text-gray-400">Auto-approve above:</span>
                                            <span className="font-medium text-green-600">{(value.autoApproveAbove * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-deep-500 dark:text-gray-400">Auto-reject below:</span>
                                            <span className="font-medium text-red-600">{(value.autoRejectBelow * 100).toFixed(0)}%</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
