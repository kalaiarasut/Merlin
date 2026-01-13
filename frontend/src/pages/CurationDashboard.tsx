import React, { useState, useEffect } from 'react';
import { curationService } from '@/services/api';
import { ReviewCard } from '@/components/curation/ReviewCard';
import { ValidationActions } from '@/components/curation/ValidationActions';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import {
    Search, History, ChevronRight, Inbox, CheckCircle, AlertCircle,
    Shield, RefreshCw, Clock, XCircle, FileCheck, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';

export const CurationDashboard: React.FC = () => {
    const [queue, setQueue] = useState<any[]>([]);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [detailData, setDetailData] = useState<any>(null);
    const [isLoadingQueue, setIsLoadingQueue] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [filterQuery, setFilterQuery] = useState('');

    useEffect(() => {
        loadQueue();
    }, []);

    const loadQueue = async () => {
        setIsLoadingQueue(true);
        try {
            const data = await curationService.getQueue();
            setQueue(data);
        } catch (error) {
            toast.error('Failed to load curation queue');
        } finally {
            setIsLoadingQueue(false);
        }
    };

    const loadDetail = async (item: any) => {
        setSelectedItem(item);
        setIsLoadingDetail(true);
        setDetailData(null);
        try {
            const data = await curationService.getDetail(item.entityType, item.id);
            setDetailData(data);
        } catch (error) {
            toast.error('Failed to load details');
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const handleAction = async (action: 'approve' | 'reject' | 'flag', data: any) => {
        if (!selectedItem) return;
        setIsSubmitting(true);
        try {
            await curationService.submitAction(selectedItem.entityType, selectedItem.id, action, data);
            toast.success(`Record ${action === 'flag' ? 'flagged' : action + 'ed'} successfully`);
            setSelectedItem(null);
            setDetailData(null);
            loadQueue();
        } catch (error: any) {
            if (error.response?.status === 409) {
                toast('This record was already validated by someone else.', { icon: '⚠️' });
            } else {
                toast.error('Failed to submit validation action');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredQueue = queue.filter(item =>
        item.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
        item.subtitle.toLowerCase().includes(filterQuery.toLowerCase())
    );

    // Calculate stats
    const pendingCount = queue.filter(q => q.status === 'pending').length;
    const underReviewCount = queue.filter(q => q.status === 'under-review').length;
    const lowConfidenceCount = queue.filter(q => q.confidence && q.confidence < 0.7).length;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-5 h-5 text-ocean-500" />
                        <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Expert Review</span>
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-gray-100">Scientific Curation</h1>
                    <p className="text-deep-500 dark:text-gray-400 mt-1">
                        Review and validate AI-processed marine biodiversity records
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={loadQueue}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh Queue
                    </Button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    title="Total Pending"
                    value={queue.length}
                    icon={<Inbox className="w-5 h-5" />}
                    iconColor="text-ocean-600"
                    iconBg="bg-ocean-50"
                    subtitle="Records awaiting review"
                />
                <StatCard
                    title="Pending Review"
                    value={pendingCount}
                    icon={<Clock className="w-5 h-5" />}
                    iconColor="text-amber-600"
                    iconBg="bg-amber-50"
                    subtitle="Not yet started"
                />
                <StatCard
                    title="Under Review"
                    value={underReviewCount}
                    icon={<Eye className="w-5 h-5" />}
                    iconColor="text-purple-600"
                    iconBg="bg-purple-50"
                    subtitle="Being reviewed"
                />
                <StatCard
                    title="Low Confidence"
                    value={lowConfidenceCount}
                    icon={<AlertCircle className="w-5 h-5" />}
                    iconColor="text-coral-600"
                    iconBg="bg-coral-50"
                    subtitle="AI confidence < 70%"
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Queue List */}
                <Card className="lg:col-span-1">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-ocean-500" />
                                    Review Queue
                                </CardTitle>
                                <CardDescription>{filteredQueue.length} items awaiting review</CardDescription>
                            </div>
                            <Badge variant="secondary">{queue.length}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {/* Search */}
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                placeholder="Filter records..."
                                className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-ocean-500/20 focus:border-ocean-500 transition-all bg-gray-50/50 dark:bg-deep-800/50"
                                value={filterQuery}
                                onChange={(e) => setFilterQuery(e.target.value)}
                            />
                        </div>

                        {/* Queue Items */}
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {isLoadingQueue ? (
                                <div className="space-y-3">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="h-20 bg-gray-100 dark:bg-deep-800 rounded-xl animate-pulse" />
                                    ))}
                                </div>
                            ) : filteredQueue.length === 0 ? (
                                <div className="text-center py-12">
                                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto opacity-30" />
                                    <p className="mt-3 text-sm font-medium text-deep-500 dark:text-gray-400">All caught up!</p>
                                    <p className="text-xs text-deep-400 dark:text-gray-500">No pending scientific reviews.</p>
                                </div>
                            ) : (
                                filteredQueue.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => loadDetail(item)}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedItem?.id === item.id
                                            ? 'border-ocean-500 bg-ocean-50/50 dark:bg-ocean-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-ocean-300 dark:hover:border-ocean-700 hover:bg-gray-50 dark:hover:bg-deep-800/50'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-deep-900 dark:text-gray-100 truncate">{item.title}</p>
                                                <p className="text-xs text-deep-500 dark:text-gray-400 mt-0.5 truncate">{item.subtitle}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <Badge
                                                        variant={item.status === 'under-review' ? 'destructive' : 'outline'}
                                                        size="sm"
                                                        className="capitalize"
                                                    >
                                                        {item.status.replace('-', ' ')}
                                                    </Badge>
                                                    {item.confidence !== undefined && (
                                                        <span className={`text-xs font-bold ${item.confidence > 0.9 ? 'text-green-600' :
                                                            item.confidence > 0.7 ? 'text-amber-500' : 'text-red-500'
                                                            }`}>
                                                            {Math.round(item.confidence * 100)}%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronRight className={`h-4 w-4 text-deep-400 flex-shrink-0 transition-transform ${selectedItem?.id === item.id ? 'translate-x-1 text-ocean-500' : ''
                                                }`} />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Detail Panel */}
                <div className="lg:col-span-2 space-y-6">
                    {selectedItem ? (
                        <>
                            {/* Selected Item Header */}
                            <Card>
                                <CardContent className="py-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h2 className="text-xl font-bold text-deep-900 dark:text-gray-100">{selectedItem.title}</h2>
                                                <Badge variant="outline" className="capitalize">{selectedItem.entityType.replace('-', ' ')}</Badge>
                                            </div>
                                            <p className="text-sm text-deep-500 dark:text-gray-400 mt-1">{selectedItem.subtitle}</p>
                                        </div>
                                        <Button variant="outline" size="sm">
                                            <History className="h-4 w-4 mr-2" />
                                            View History
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Detail Content */}
                            {isLoadingDetail ? (
                                <div className="space-y-4">
                                    <div className="h-64 bg-gray-100 dark:bg-deep-800 rounded-2xl animate-pulse" />
                                    <div className="h-48 bg-gray-100 dark:bg-deep-800 rounded-2xl animate-pulse" />
                                </div>
                            ) : detailData ? (
                                <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                                    <div className="xl:col-span-3">
                                        <ReviewCard data={detailData} entityType={selectedItem.entityType} />
                                    </div>
                                    <div className="xl:col-span-2 space-y-6">
                                        <ValidationActions
                                            onAction={handleAction}
                                            isLoading={isSubmitting}
                                            entityType={selectedItem.entityType}
                                        />

                                        {/* Expert Guidelines */}
                                        <Card variant="premium">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <AlertCircle className="h-4 w-4 text-ocean-500" />
                                                    Expert Guidelines
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="text-xs text-deep-600 dark:text-gray-300 space-y-2">
                                                <p><strong>1.</strong> Verify taxonomic ID against <strong>WoRMS</strong> or <strong>FishBase</strong>.</p>
                                                <p><strong>2.</strong> Check geographic context against known native ranges.</p>
                                                <p><strong>3.</strong> Validate temporal data consistency (spawning seasons, migration).</p>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <Card className="h-full min-h-[400px] flex items-center justify-center">
                            <div className="text-center p-8">
                                <div className="h-20 w-20 bg-gray-100 dark:bg-deep-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Shield className="h-10 w-10 text-deep-300 dark:text-gray-600" />
                                </div>
                                <h3 className="text-xl font-bold text-deep-900 dark:text-gray-100 mb-2">Scientific Curation</h3>
                                <p className="text-sm text-deep-500 dark:text-gray-400 max-w-sm mx-auto">
                                    Select a record from the queue to begin the expert validation process.
                                </p>
                                <Button variant="outline" className="mt-4" onClick={loadQueue}>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Refresh Queue
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};
