/**
 * Virtual Data Table Component
 * 
 * High-performance table for large datasets using react-virtuoso
 * Features:
 * - Virtual scrolling (renders only visible rows)
 * - Sorting
 * - Filtering
 * - Column resizing
 * - Row selection
 * - Lazy loading with infinite scroll
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { TableVirtuoso, VirtuosoHandle } from 'react-virtuoso';
import { 
  ChevronUp, ChevronDown, Search, X, Filter, 
  Download, ChevronLeft, ChevronRight, Loader2,
  ArrowUpDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

export interface VirtualTableProps<T extends Record<string, any>> {
  data: T[];
  columns: Column<T>[];
  height?: number | string;
  rowHeight?: number;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRowClick?: (row: T, index: number) => void;
  onSelectionChange?: (selectedRows: T[]) => void;
  selectable?: boolean;
  stickyHeader?: boolean;
  striped?: boolean;
  bordered?: boolean;
  emptyMessage?: string;
  className?: string;
  rowClassName?: (row: T, index: number) => string;
  getRowId?: (row: T) => string | number;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string | null;
  direction: SortDirection;
}

export default function VirtualTable<T extends Record<string, any>>({
  data,
  columns,
  height = 600,
  rowHeight = 48,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  onRowClick,
  onSelectionChange,
  selectable = false,
  stickyHeader = true,
  striped = true,
  bordered = true,
  emptyMessage = 'No data available',
  className,
  rowClassName,
  getRowId = (row) => row.id || row._id,
}: VirtualTableProps<T>) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Filter data
  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        result = result.filter(row => {
          const cellValue = getNestedValue(row, key);
          return String(cellValue).toLowerCase().includes(value.toLowerCase());
        });
      }
    });

    // Apply sorting
    if (sortState.column && sortState.direction) {
      result.sort((a, b) => {
        const aVal = getNestedValue(a, sortState.column!);
        const bVal = getNestedValue(b, sortState.column!);

        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        const comparison = aVal < bVal ? -1 : 1;
        return sortState.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, filters, sortState]);

  // Handle sort
  const handleSort = useCallback((column: string) => {
    setSortState(prev => ({
      column,
      direction: 
        prev.column !== column ? 'asc' :
        prev.direction === 'asc' ? 'desc' :
        prev.direction === 'desc' ? null : 'asc'
    }));
  }, []);

  // Handle filter change
  const handleFilterChange = useCallback((column: string, value: string) => {
    setFilters(prev => ({ ...prev, [column]: value }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({});
    setSortState({ column: null, direction: null });
  }, []);

  // Handle row selection
  const handleRowSelect = useCallback((row: T) => {
    const rowId = getRowId(row);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      
      // Notify parent of selection change
      const selectedRows = data.filter(r => next.has(getRowId(r)));
      onSelectionChange?.(selectedRows);
      
      return next;
    });
  }, [data, getRowId, onSelectionChange]);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredData.length) {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    } else {
      const allIds = new Set(filteredData.map(getRowId));
      setSelectedIds(allIds);
      onSelectionChange?.(filteredData);
    }
  }, [filteredData, selectedIds.size, getRowId, onSelectionChange]);

  // Handle infinite scroll
  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  // Render header
  const renderHeader = useCallback(() => (
    <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
      {selectable && (
        <th className="w-10 px-2 py-3">
          <input
            type="checkbox"
            checked={selectedIds.size === filteredData.length && filteredData.length > 0}
            onChange={handleSelectAll}
            className="rounded border-gray-300"
          />
        </th>
      )}
      {columns.map((column) => (
        <th
          key={String(column.key)}
          className={cn(
            'px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider',
            column.align === 'center' && 'text-center',
            column.align === 'right' && 'text-right',
            column.sortable && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none'
          )}
          style={{ width: column.width, minWidth: column.minWidth }}
          onClick={() => column.sortable && handleSort(String(column.key))}
        >
          <div className="flex items-center gap-1">
            <span>{column.header}</span>
            {column.sortable && (
              <span className="ml-1">
                {sortState.column === column.key ? (
                  sortState.direction === 'asc' ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : sortState.direction === 'desc' ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30" />
                  )
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-30" />
                )}
              </span>
            )}
          </div>
        </th>
      ))}
    </tr>
  ), [columns, selectable, selectedIds.size, filteredData.length, sortState, handleSort, handleSelectAll]);

  // Render row
  const renderRow = useCallback((index: number, row: T) => {
    const rowId = getRowId(row);
    const isSelected = selectedIds.has(rowId);

    return (
      <tr
        className={cn(
          'transition-colors',
          striped && index % 2 === 1 && 'bg-gray-50/50 dark:bg-gray-800/50',
          isSelected && 'bg-cyan-50 dark:bg-cyan-900/30',
          onRowClick && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700',
          rowClassName?.(row, index)
        )}
        onClick={() => {
          onRowClick?.(row, index);
          if (selectable) handleRowSelect(row);
        }}
      >
        {selectable && (
          <td className="w-10 px-2 py-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleRowSelect(row)}
              onClick={(e) => e.stopPropagation()}
              className="rounded border-gray-300"
            />
          </td>
        )}
        {columns.map((column) => {
          const value = getNestedValue(row, String(column.key));
          return (
            <td
              key={String(column.key)}
              className={cn(
                'px-4 py-2 text-sm text-gray-900 dark:text-gray-100',
                bordered && 'border-b dark:border-gray-700',
                column.align === 'center' && 'text-center',
                column.align === 'right' && 'text-right'
              )}
              style={{ width: column.width, minWidth: column.minWidth }}
            >
              {column.render ? column.render(value, row, index) : formatValue(value)}
            </td>
          );
        })}
      </tr>
    );
  }, [columns, selectable, selectedIds, striped, bordered, onRowClick, rowClassName, getRowId, handleRowSelect]);

  // Render filters
  const renderFilters = () => (
    <div className="p-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 space-y-2">
      <div className="flex flex-wrap gap-2">
        {columns.filter(c => c.filterable !== false).map((column) => (
          <div key={String(column.key)} className="flex-1 min-w-[150px] max-w-[250px]">
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
              {column.header}
            </label>
            <div className="relative">
              <input
                type="text"
                value={filters[String(column.key)] || ''}
                onChange={(e) => handleFilterChange(String(column.key), e.target.value)}
                placeholder={`Filter ${column.header.toLowerCase()}...`}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
              />
              {filters[String(column.key)] && (
                <button
                  onClick={() => handleFilterChange(String(column.key), '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={clearFilters}
        className="text-xs text-cyan-600 hover:text-cyan-700"
      >
        Clear all filters
      </button>
    </div>
  );

  // Loading state
  if (loading) {
    return (
      <div className={cn('flex items-center justify-center', className)} style={{ height }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border dark:border-gray-700 overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-900 border-b dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {filteredData.length.toLocaleString()} {filteredData.length === 1 ? 'row' : 'rows'}
            {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
              showFilters && 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700'
            )}
            title="Toggle filters"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && renderFilters()}

      {/* Table */}
      {filteredData.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <TableVirtuoso
          ref={virtuosoRef}
          style={{ height: typeof height === 'number' ? height : height }}
          data={filteredData}
          fixedHeaderContent={renderHeader}
          itemContent={(index, row) => renderRow(index, row)}
          endReached={handleEndReached}
          components={{
            Table: ({ style, ...props }) => (
              <table
                {...props}
                style={{ ...style, width: '100%', tableLayout: 'fixed' }}
                className="divide-y divide-gray-200 dark:divide-gray-700"
              />
            ),
            TableHead: React.forwardRef(({ style, ...props }, ref) => (
              <thead {...props} ref={ref} style={style} />
            )),
            TableRow: ({ style, ...props }) => (
              <tr {...props} style={style} />
            ),
            TableBody: React.forwardRef(({ style, ...props }, ref) => (
              <tbody {...props} ref={ref} style={style} />
            )),
          }}
        />
      )}

      {/* Loading more indicator */}
      {loadingMore && (
        <div className="flex items-center justify-center py-3 border-t dark:border-gray-700">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-600 mr-2" />
          <span className="text-sm text-gray-500">Loading more...</span>
        </div>
      )}
    </div>
  );
}

// Helper: Get nested object value
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

// Helper: Format value for display
function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export { VirtualTable };
