import React, { useState } from 'react';
import { Check, X, Flag, MessageSquare, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ValidationActionsProps {
    onAction: (action: 'approve' | 'reject' | 'flag', data: any) => Promise<void>;
    isLoading?: boolean;
    entityType?: string;
}

export const ValidationActions: React.FC<ValidationActionsProps> = ({ onAction, isLoading, entityType }) => {
    const [comment, setComment] = useState('');
    const [scope, setScope] = useState<'full-record' | 'metadata-only' | 'taxonomy' | 'measurement'>('full-record');
    const [showComment, setShowComment] = useState(false);

    const handleAction = async (action: 'approve' | 'reject' | 'flag') => {
        await onAction(action, {
            comment,
            scope,
            snapshot: {
                fieldsValidated: [scope],
                // previousValues would be populated by the caller if needed
            }
        });
        setComment('');
        setShowComment(false);
    };

    return (
        <Card className="border-t-4 border-t-primary shadow-lg">
            <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold">Scientific Validation</h3>
                    </div>
                    <Badge variant="outline" className="capitalize">
                        Targeting: {scope.replace('-', ' ')}
                    </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Validation Scope</label>
                        <Select value={scope} onValueChange={(v: any) => setScope(v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select Scope" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="full-record">Full Record</SelectItem>
                                <SelectItem value="taxonomy">Taxonomy Only</SelectItem>
                                <SelectItem value="metadata-only">Metadata Only</SelectItem>
                                <SelectItem value="measurement">Measurements Only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-end gap-2">
                        <Button
                            variant="outline"
                            className="w-full flex gap-2"
                            onClick={() => setShowComment(!showComment)}
                        >
                            <MessageSquare className="h-4 w-4" />
                            {showComment ? 'Hide Comment' : 'Add Comment'}
                        </Button>
                    </div>
                </div>

                {showComment && (
                    <Textarea
                        placeholder="Technical details for rejection or flagging..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="min-h-[100px]"
                    />
                )}

                <div className="flex gap-3 pt-2">
                    <Button
                        variant="default"
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white flex gap-2"
                        onClick={() => handleAction('approve')}
                        disabled={isLoading}
                    >
                        <Check className="h-4 w-4" />
                        Approve
                    </Button>

                    <Button
                        variant="outline"
                        className="flex-1 border-amber-500 text-amber-600 hover:bg-amber-50 flex gap-2"
                        onClick={() => handleAction('flag')}
                        disabled={isLoading}
                    >
                        <Flag className="h-4 w-4" />
                        Flag for Review
                    </Button>

                    <Button
                        variant="destructive"
                        className="flex-1 flex gap-2"
                        onClick={() => handleAction('reject')}
                        disabled={isLoading}
                    >
                        <X className="h-4 w-4" />
                        Reject
                    </Button>
                </div>

                {showComment && comment.length < 5 && (
                    <p className="text-[10px] text-amber-500 italic">Recommendation: Provide a reason for rejection or flagging.</p>
                )}
            </CardContent>
        </Card>
    );
};
