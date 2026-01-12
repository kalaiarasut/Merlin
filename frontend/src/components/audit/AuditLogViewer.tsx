import { useState, useEffect } from 'react';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { auditService } from '@/services/api';
import { Loader2, Search, Filter, Calendar, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function AuditLogViewer() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [filters, setFilters] = useState({
        userId: '',
        entityType: 'all',
        severity: 'all',
        startDate: '',
        endDate: ''
    });

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params: any = {
                page: pagination.page,
                limit: pagination.limit
            };

            if (filters.userId) params.userId = filters.userId;
            if (filters.entityType !== 'all') params.entityType = filters.entityType;
            if (filters.severity !== 'all') params.severity = filters.severity;

            const response = await auditService.getLogs(params);
            setLogs(response.logs);
            setPagination(response.pagination);
        } catch (error) {
            console.error("Failed to fetch logs", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [pagination.page, filters]); // Re-fetch on page/filter change (consider debouncing filters in real usage)

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
    };

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'ERROR': return <Badge variant="destructive">Error</Badge>;
            case 'WARNING': return <Badge variant="warning" className="bg-amber-100 text-amber-800">Warning</Badge>; // Assuming custom variant or wait, Badge usually has default/secondary/destructive/outline
            case 'INFO': return <Badge variant="secondary">Info</Badge>;
            default: return <Badge variant="outline">{severity}</Badge>;
        }
    };

    return (
        <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    System Activity Logs
                </CardTitle>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="flex items-center gap-2">
                        <Search className="w-4 h-4 text-gray-500" />
                        <Input
                            placeholder="Filter by User ID..."
                            value={filters.userId}
                            onChange={(e) => handleFilterChange('userId', e.target.value)}
                        />
                    </div>
                    <Select value={filters.entityType} onValueChange={(val) => handleFilterChange('entityType', val)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Entity Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Entities</SelectItem>
                            <SelectItem value="dataset">Dataset</SelectItem>
                            <SelectItem value="analysis">Analysis</SelectItem>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="report">Report</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filters.severity} onValueChange={(val) => handleFilterChange('severity', val)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Severity" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Severities</SelectItem>
                            <SelectItem value="INFO">Info</SelectItem>
                            <SelectItem value="WARNING">Warning</SelectItem>
                            <SelectItem value="ERROR">Error</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Table */}
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Entity</TableHead>
                                <TableHead>Severity</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24 text-gray-500">
                                        No logs found matching your criteria.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log._id}>
                                        <TableCell className="font-mono text-xs">
                                            {format(new Date(log.timestamp), 'MMM dd HH:mm:ss')}
                                        </TableCell>
                                        <TableCell>{log.userName || log.userId}</TableCell>
                                        <TableCell>
                                            <span className="font-medium text-xs">{log.actionType}</span>
                                            <span className="block text-[10px] text-gray-500">{log.action}</span>
                                        </TableCell>
                                        <TableCell>
                                            {log.entityType}
                                            <span className="block text-[10px] text-gray-400 font-mono truncate max-w-[100px]">{log.entityId}</span>
                                        </TableCell>
                                        <TableCell>
                                            {getSeverityBadge(log.severity)}
                                        </TableCell>
                                        <TableCell className="max-w-xs truncate text-xs text-gray-600">
                                            {log.errorMessage ? (
                                                <span className="text-red-500 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" />
                                                    {log.errorMessage}
                                                </span>
                                            ) : (
                                                JSON.stringify(log.details)
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-500">
                        Page {pagination.page} of {pagination.pages} ({pagination.total} records)
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                            disabled={pagination.page <= 1 || loading}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                            disabled={pagination.page >= pagination.pages || loading}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
