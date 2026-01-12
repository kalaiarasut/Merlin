import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, FileText, Info, AlertTriangle } from 'lucide-react';

interface ReviewCardProps {
    data: any;
    entityType: string;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({ data, entityType }) => {
    const isSpecies = entityType === 'species';

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                            <Database className="h-3 w-3" />
                            Source Dataset
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="font-semibold text-sm truncate" title={data.datasetId || data.jobId}>
                            {data.datasetId || data.jobId || 'Unknown'}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                            <FileText className="h-3 w-3" />
                            Ingestion Job
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="font-semibold text-sm">#{data.jobId?.slice(-8) || 'N/A'}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                            <Info className="h-3 w-3" />
                            AI Confidence
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${(data.aiMetadata?.confidence || 0) > 0.9 ? 'text-green-600' :
                                (data.aiMetadata?.confidence || 0) > 0.7 ? 'text-amber-500' : 'text-red-500'
                            }`}>
                            {Math.round((data.aiMetadata?.confidence || 0) * 100)}%
                        </span>
                        {(data.aiMetadata?.confidence || 0) < 0.7 && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Scientific Attributes (Proposed)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        {isSpecies ? (
                            <>
                                <Attribute label="Scientific Name" value={data.scientificName} highlight />
                                <Attribute label="Common Name" value={data.commonName} />
                                <Attribute label="Family" value={data.family} />
                                <Attribute label="Genus" value={data.genus} />
                                <Attribute label="Class" value={data.class} />
                                <Attribute label="Order" value={data.order} />
                            </>
                        ) : (
                            <>
                                <Attribute label="Species" value={data.species} highlight />
                                <Attribute label="Catch (kg)" value={data.catch} />
                                <Attribute label="Date" value={data.date} />
                                <Attribute label="Location" value={data.location?.name || 'Unknown'} />
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>

            {data.aiMetadata && (
                <Card className="bg-slate-50 border-dashed">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Extraction Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-2">
                        <div className="flex flex-wrap gap-1">
                            {data.aiMetadata.extractedTags?.map((tag: string) => (
                                <Badge key={tag} variant="secondary" className="text-[10px]">
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                        {data.aiMetadata.cleaningApplied && data.aiMetadata.cleaningApplied.length > 0 && (
                            <p className="text-muted-foreground italic">
                                Cleaning applied: {data.aiMetadata.cleaningApplied.join(', ')}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

const Attribute = ({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) => (
    <div className="space-y-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">{label}</span>
        <p className={`text-sm ${highlight ? 'font-bold text-primary' : 'font-medium ml-1'}`}>
            {value || 'N/A'}
        </p>
    </div>
);
