import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import {
  Code, Book, Copy, ExternalLink, ChevronRight, ChevronDown,
  Search, Terminal, Key, Lock, CheckCircle2, Play, Database,
  FileText, Zap, Globe, Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const API_ENDPOINTS = [
  {
    category: 'Species',
    icon: '🐟',
    endpoints: [
      { method: 'GET', path: '/api/species', desc: 'List all species', auth: true },
      { method: 'GET', path: '/api/species/:id', desc: 'Get species by ID', auth: true },
      { method: 'POST', path: '/api/species', desc: 'Create new species', auth: true },
      { method: 'PUT', path: '/api/species/:id', desc: 'Update species', auth: true },
      { method: 'DELETE', path: '/api/species/:id', desc: 'Delete species', auth: true },
    ],
  },
  {
    category: 'Oceanography',
    icon: '🌊',
    endpoints: [
      { method: 'GET', path: '/api/oceanography', desc: 'Get oceanographic data', auth: true },
      { method: 'GET', path: '/api/oceanography/stations', desc: 'List sampling stations', auth: true },
      { method: 'POST', path: '/api/oceanography/query', desc: 'Query by parameters', auth: true },
    ],
  },
  {
    category: 'eDNA',
    icon: '🧬',
    endpoints: [
      { method: 'GET', path: '/api/edna/samples', desc: 'List eDNA samples', auth: true },
      { method: 'POST', path: '/api/edna/upload', desc: 'Upload sequence file', auth: true },
      { method: 'GET', path: '/api/edna/results/:id', desc: 'Get analysis results', auth: true },
    ],
  },
  {
    category: 'Analytics',
    icon: '📊',
    endpoints: [
      { method: 'GET', path: '/api/analytics/summary', desc: 'Get summary statistics', auth: true },
      { method: 'POST', path: '/api/analytics/query', desc: 'Custom analytics query', auth: true },
    ],
  },
  {
    category: 'Authentication',
    icon: '🔐',
    endpoints: [
      { method: 'POST', path: '/api/auth/login', desc: 'User login', auth: false },
      { method: 'POST', path: '/api/auth/logout', desc: 'User logout', auth: true },
      { method: 'GET', path: '/api/auth/me', desc: 'Get current user', auth: true },
    ],
  },
];

const CODE_EXAMPLES = {
  curl: `curl -X GET "https://api.cmlre.gov.in/api/species" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,
  javascript: `const response = await fetch('https://api.cmlre.gov.in/api/species', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);`,
  python: `import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}

response = requests.get(
    'https://api.cmlre.gov.in/api/species',
    headers=headers
)

data = response.json()
print(data)`,
};

export default function ApiDocs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Species');
  const [selectedLanguage, setSelectedLanguage] = useState<'curl' | 'javascript' | 'python'>('javascript');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const getMethodBadge = (method: string) => {
    const variants: Record<string, string> = {
      GET: 'bg-marine-100 text-marine-700',
      POST: 'bg-ocean-100 text-ocean-700',
      PUT: 'bg-coral-100 text-coral-700',
      DELETE: 'bg-abyss-100 text-abyss-700',
    };
    return (
      <span className={cn("px-2 py-1 rounded-md text-xs font-bold", variants[method])}>
        {method}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Code className="w-5 h-5 text-ocean-500" />
            <span className="text-sm font-medium text-ocean-600">Developer Resources</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900">API Documentation</h1>
          <p className="text-deep-500 mt-1">
            RESTful API for marine data access and integration
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">
            <Key className="w-4 h-4 mr-2" />
            Get API Key
          </Button>
          <Button variant="premium">
            <ExternalLink className="w-4 h-4 mr-2" />
            OpenAPI Spec
          </Button>
        </div>
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="glass" className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-ocean-100">
              <Globe className="w-5 h-5 text-ocean-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-deep-900">Base URL</p>
              <p className="text-xs text-deep-500 font-mono">api.cmlre.gov.in</p>
            </div>
          </div>
        </Card>
        <Card variant="glass" className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-marine-100">
              <Zap className="w-5 h-5 text-marine-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-deep-900">Version</p>
              <p className="text-xs text-deep-500">v1.0 (Current)</p>
            </div>
          </div>
        </Card>
        <Card variant="glass" className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-coral-100">
              <Shield className="w-5 h-5 text-coral-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-deep-900">Auth</p>
              <p className="text-xs text-deep-500">Bearer Token (JWT)</p>
            </div>
          </div>
        </Card>
        <Card variant="glass" className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-abyss-100">
              <Database className="w-5 h-5 text-abyss-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-deep-900">Format</p>
              <p className="text-xs text-deep-500">JSON</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Endpoints List */}
        <div className="xl:col-span-2 space-y-4">
          {/* Search */}
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search endpoints..."
            icon={<Search className="w-4 h-4" />}
          />

          {/* Endpoint Categories */}
          {API_ENDPOINTS.map((category) => (
            <Card key={category.category} variant="default">
              <button
                onClick={() => setExpandedCategory(
                  expandedCategory === category.category ? null : category.category
                )}
                className="w-full"
              >
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{category.icon}</span>
                      <CardTitle className="text-lg">{category.category}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {category.endpoints.length} endpoints
                      </Badge>
                    </div>
                    {expandedCategory === category.category ? (
                      <ChevronDown className="w-5 h-5 text-deep-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-deep-400" />
                    )}
                  </div>
                </CardHeader>
              </button>
              {expandedCategory === category.category && (
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    {category.endpoints.map((endpoint, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        {getMethodBadge(endpoint.method)}
                        <code className="flex-1 text-sm font-mono text-deep-700">
                          {endpoint.path}
                        </code>
                        <span className="text-sm text-deep-500 hidden md:block">
                          {endpoint.desc}
                        </span>
                        {endpoint.auth && (
                          <Lock className="w-4 h-4 text-deep-400" />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* Code Examples */}
        <div className="space-y-4">
          <Card variant="premium">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="w-4 h-4 text-ocean-500" />
                Code Examples
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Language Tabs */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
                {(['curl', 'javascript', 'python'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setSelectedLanguage(lang)}
                    className={cn(
                      "flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all",
                      selectedLanguage === lang
                        ? "bg-white shadow-sm text-deep-900"
                        : "text-deep-500 hover:text-deep-700"
                    )}
                  >
                    {lang.charAt(0).toUpperCase() + lang.slice(1)}
                  </button>
                ))}
              </div>

              {/* Code Block */}
              <div className="relative">
                <pre className="p-4 bg-deep-900 rounded-xl overflow-x-auto text-sm">
                  <code className="text-gray-300 whitespace-pre-wrap">
                    {CODE_EXAMPLES[selectedLanguage]}
                  </code>
                </pre>
                <button
                  onClick={() => copyToClipboard(CODE_EXAMPLES[selectedLanguage])}
                  className="absolute top-2 right-2 p-2 bg-deep-800 hover:bg-deep-700 rounded-lg transition-colors"
                >
                  <Copy className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <Button variant="outline" className="w-full mt-4" size="sm">
                <Play className="w-4 h-4 mr-2" />
                Try in Playground
              </Button>
            </CardContent>
          </Card>

          {/* Authentication Guide */}
          <Card variant="default">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-ocean-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-ocean-700">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-deep-900">Get API Key</p>
                  <p className="text-xs text-deep-500">Generate from Admin Console</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-ocean-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-ocean-700">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-deep-900">Add Header</p>
                  <p className="text-xs text-deep-500 font-mono">Authorization: Bearer {'<key>'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-marine-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-marine-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-deep-900">Ready!</p>
                  <p className="text-xs text-deep-500">Make authenticated requests</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rate Limits */}
          <Card variant="glass">
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold text-deep-900 mb-3">Rate Limits</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-deep-500">Free Tier</span>
                  <span className="font-medium text-deep-900">100 req/hour</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-deep-500">Research</span>
                  <span className="font-medium text-deep-900">1,000 req/hour</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-deep-500">Enterprise</span>
                  <span className="font-medium text-deep-900">Unlimited</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
