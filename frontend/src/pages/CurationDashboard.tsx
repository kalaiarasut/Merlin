import React, { useState, useEffect } from 'react';
import { curationService } from '@/services/api';
import { ReviewCard } from '@/components/curation/ReviewCard';
import { ValidationActions } from '@/components/curation/ValidationActions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, History, ChevronRight, Inbox, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

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
                toast.warning('This record was already validated by someone else.');
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

    return (
        <div className="flex h-[calc(100vh-64px)] bg-slate-50 overflow-hidden">
            {/* Sidebar Queue */}
            <div className="w-80 border-r bg-white flex flex-col shadow-sm">
                <div className="p-4 border-b space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold flex items-center gap-2">
                            <Inbox className="h-4 w-4 text-primary" />
                            Review Queue
                        </h2>
                        <Badge variant="secondary" className="px-1.5 h-5">{queue.length}</Badge>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            placeholder="Filter records..."
                            className="w-full pl-9 pr-4 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-slate-50"
                            value={filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                        />
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    {isLoadingQueue ? (
                        <div className="p-4 space-y-4">
                            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                        </div>
                    ) : filteredQueue.length === 0 ? (
                        <div className="p-12 text-center space-y-3">
                            <CheckCircle className="h-12 w-12 text-green-500 mx-auto opacity-20" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-muted-foreground">All caught up!</p>
                                <p className="text-[10px] text-muted-foreground italic">No pending scientific reviews.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredQueue.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => loadDetail(item)}
                                    className={`w-full p-4 text-left hover:bg-slate-50 transition-all flex items-center justify-between group ${selectedItem?.id === item.id ? 'bg-primary/5 border-l-4 border-primary' : 'border-l-4 border-transparent'
                                        }`}
                                >
                                    <div className="space-y-1.5 overflow-hidden">
                                        <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{item.title}</p>
                                        <p className="text-[11px] text-muted-foreground truncate leading-tight">{item.subtitle}</p>
                                        <div className="flex items-center gap-2 pt-1">
                                            <Badge
                                                variant={item.status === 'under-review' ? 'destructive' : 'outline'}
                                                className={`text-[9px] px-1.5 h-4 capitalize ${item.status === 'pending' ? 'bg-blue-50 text-blue-600 border-blue-200' : ''
                                                    }`}
                                            >
                                                {item.status.replace('-', ' ')}
                                            </Badge>
                                            {item.confidence !== undefined && (
                                                <span className={`text-[9px] font-bold ${item.confidence > 0.9 ? 'text-green-600' :
                                                        item.confidence > 0.7 ? 'text-amber-500' : 'text-red-500'
                                                    }`}>
                                                    {Math.round(item.confidence * 100)}% Match
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${selectedItem?.id === item.id ? 'translate-x-1 text-primary' : ''
                                        }`} />
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Main Content Detail */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50">
                {selectedItem ? (
                    <div className="max-w-5xl mx-auto p-8 space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between bg-white p-6 rounded-lg border shadow-sm">
                            <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-black tracking-tight">{selectedItem.title}</h1>
                                    <Badge variant="outline" className="bg-slate-50">{selectedItem.entityType.replace('-', ' ')}</Badge>
                                </div>
                                <p className="text-muted-foreground flex items-center gap-2 text-sm italic">
                                    {selectedItem.subtitle}
                                </p>
                            </div>
                            <Button variant="outline" size="sm" className="flex gap-2 text-xs font-semibold">
                                <History className="h-3.5 w-3.5" />
                                Review History
                            </Button>
                        </div>

                        {isLoadingDetail ? (
                            <div className="space-y-6 pt-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <Skeleton className="h-24 w-full" />
                                    <Skeleton className="h-24 w-full" />
                                    <Skeleton className="h-24 w-full" />
                                </div>
                                <Skeleton className="h-[400px] w-full" />
                            </div>
                        ) : detailData ? (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                <div className="lg:col-span-8">
                                    <ReviewCard data={detailData} entityType={selectedItem.entityType} />
                                </div>
                                <div className="lg:col-span-4 space-y-6 sticky top-8">
                                    <ValidationActions
                                        onAction={handleAction}
                                        isLoading={isSubmitting}
                                        entityType={selectedItem.entityType}
                                    />

                                    <Card className="bg-primary/5 border-primary/20 overflow-hidden">
                                        <CardHeader className="pb-2 bg-primary/10">
                                            <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-primary">
                                                <AlertCircle className="h-4 w-4" />
                                                Expert Guidelines
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="text-[11px] text-slate-600 space-y-3 pt-4 font-medium leading-relaxed">
                                            <div className="flex gap-2">
                                                <span className="text-primary font-bold">1.</span>
                                                <p>Verify taxonomic ID against **WoRMS** or **FishBase** official databases.</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="text-primary font-bold">2.</span>
                                                <p>Analyze geographic context; flag records isolated from known native ranges.</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="text-primary font-bold">3.</span>
                                                <p>Validate temporal data consistency (spawning seasons, migration peaks).</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <div className="max-w-sm flex flex-col items-center gap-6">
                            <div className="h-24 w-24 bg-white rounded-full flex items-center justify-center shadow-inner border border-slate-100">
                                <Inbox className="h-10 w-10 text-slate-300" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-black tracking-tight text-slate-800">Scientific Curation</h2>
                                <p className="text-sm text-slate-500 font-medium">
                                    The integrity of our data backbone depends on expert human-in-the-loop validation. Select a record to begin.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                className="mt-4 border-primary/20 text-primary hover:bg-primary/5"
                                onClick={loadQueue}
                            >
                                Refresh Queue
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
