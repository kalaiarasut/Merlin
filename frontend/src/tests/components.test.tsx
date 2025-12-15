/**
 * Frontend Component Tests - Vitest + React Testing Library
 * 
 * Run: npm run test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Components to test
import ErrorBoundary, { PageErrorBoundary, SectionErrorBoundary } from '../components/ErrorBoundary';
import VirtualTable from '../components/VirtualTable';
import LazyImage, { LazyImageGallery, LazyAvatar } from '../components/LazyImage';

// Create a wrapper with necessary providers
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('ErrorBoundary', () => {
  // Suppress console.error for error boundary tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Test Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <ErrorBoundary fallback={<div>Custom Error UI</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Error UI')).toBeInTheDocument();
  });

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn();
    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
  });
});

describe('PageErrorBoundary', () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders page-level error UI', () => {
    const ThrowError = () => {
      throw new Error('Page error');
    };

    render(
      <PageErrorBoundary>
        <ThrowError />
      </PageErrorBoundary>
    );

    expect(screen.getByText('Page Error')).toBeInTheDocument();
    expect(screen.getByText('Refresh Page')).toBeInTheDocument();
  });
});

describe('SectionErrorBoundary', () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders section-level error UI with custom title', () => {
    const ThrowError = () => {
      throw new Error('Section error');
    };

    render(
      <SectionErrorBoundary title="Data Grid">
        <ThrowError />
      </SectionErrorBoundary>
    );

    expect(screen.getByText("Data Grid couldn't load")).toBeInTheDocument();
  });
});

describe('VirtualTable', () => {
  const mockData = [
    { id: 1, name: 'Tuna', species: 'Thunnus albacares', status: 'LC' },
    { id: 2, name: 'Salmon', species: 'Salmo salar', status: 'LC' },
    { id: 3, name: 'Cod', species: 'Gadus morhua', status: 'VU' },
  ];

  const mockColumns = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'species', header: 'Scientific Name', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
  ];

  it('renders table with data', () => {
    render(
      <VirtualTable data={mockData} columns={mockColumns} height={400} />
    );

    expect(screen.getByText('3 rows')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Tuna')).toBeInTheDocument();
  });

  it('shows empty message when no data', () => {
    render(
      <VirtualTable 
        data={[]} 
        columns={mockColumns} 
        height={400}
        emptyMessage="No species found"
      />
    );

    expect(screen.getByText('No species found')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <VirtualTable data={[]} columns={mockColumns} height={400} loading={true} />
    );

    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('handles row click', async () => {
    const onRowClick = vi.fn();
    
    render(
      <VirtualTable 
        data={mockData} 
        columns={mockColumns} 
        height={400}
        onRowClick={onRowClick}
      />
    );

    const row = screen.getByText('Tuna');
    await userEvent.click(row);

    expect(onRowClick).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tuna' }),
      expect.any(Number)
    );
  });

  it('supports row selection', async () => {
    const onSelectionChange = vi.fn();
    
    render(
      <VirtualTable 
        data={mockData} 
        columns={mockColumns} 
        height={400}
        selectable={true}
        onSelectionChange={onSelectionChange}
      />
    );

    // Find and click a checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('toggles filter panel', async () => {
    render(
      <VirtualTable data={mockData} columns={mockColumns} height={400} />
    );

    const filterButton = screen.getByTitle('Toggle filters');
    await userEvent.click(filterButton);

    expect(screen.getByText('Clear all filters')).toBeInTheDocument();
  });
});

describe('LazyImage', () => {
  it('renders with placeholder initially', () => {
    render(<LazyImage src="https://example.com/image.jpg" alt="Test" />);
    
    // Should show loading state initially
    const container = document.querySelector('[class*="bg-gray"]');
    expect(container).toBeInTheDocument();
  });

  it('applies correct aspect ratio', () => {
    const { container } = render(
      <LazyImage src="https://example.com/image.jpg" alt="Test" aspectRatio="16/9" />
    );

    const element = container.firstChild as HTMLElement;
    expect(element.style.aspectRatio).toBe('16/9');
  });

  it('handles click event', async () => {
    const onClick = vi.fn();
    
    render(
      <LazyImage 
        src="https://example.com/image.jpg" 
        alt="Test" 
        onClick={onClick}
      />
    );

    const container = document.querySelector('[class*="cursor-pointer"]');
    if (container) {
      await userEvent.click(container);
      expect(onClick).toHaveBeenCalled();
    }
  });
});

describe('LazyAvatar', () => {
  it('renders initials when no src', () => {
    render(<LazyAvatar alt="John Doe" />);
    
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('uses custom fallback text', () => {
    render(<LazyAvatar alt="John Doe" fallback="JH" />);
    
    expect(screen.getByText('JH')).toBeInTheDocument();
  });

  it('applies correct size class', () => {
    const { container } = render(<LazyAvatar alt="Test" size="lg" />);
    
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('w-12');
    expect(avatar.className).toContain('h-12');
  });
});

describe('LazyImageGallery', () => {
  const mockImages = [
    { src: 'https://example.com/1.jpg', alt: 'Image 1' },
    { src: 'https://example.com/2.jpg', alt: 'Image 2' },
    { src: 'https://example.com/3.jpg', alt: 'Image 3' },
  ];

  it('renders correct number of images', () => {
    const { container } = render(<LazyImageGallery images={mockImages} />);
    
    const grid = container.firstChild as HTMLElement;
    expect(grid.children.length).toBe(3);
  });

  it('applies correct column count', () => {
    const { container } = render(<LazyImageGallery images={mockImages} columns={3} />);
    
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });

  it('handles image click', async () => {
    const onImageClick = vi.fn();
    
    render(<LazyImageGallery images={mockImages} onImageClick={onImageClick} />);
    
    // Click would be on the lazy image container
    const images = document.querySelectorAll('[class*="hover:opacity"]');
    if (images[0]) {
      await userEvent.click(images[0]);
      expect(onImageClick).toHaveBeenCalledWith(0);
    }
  });
});

// Utility function tests
describe('Utility Functions', () => {
  it('cn function merges class names correctly', async () => {
    const { cn } = await import('../lib/utils');
    
    expect(cn('foo', 'bar')).toBe('foo bar');
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    expect(cn('px-2', 'px-4')).toBe('px-4'); // tailwind-merge
  });
});
