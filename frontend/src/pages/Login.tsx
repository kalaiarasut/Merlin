import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Waves, Mail, Lock, ArrowRight, Shield, Sparkles, Database, Fish } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Database, label: 'Unified Database', desc: 'Species, Oceanography, Fisheries Catch, Otolith, eDNA, Survey' },
    { icon: Fish, label: 'Species Analysis', desc: 'AI-powered identification' },
    { icon: Sparkles, label: 'Smart Analytics', desc: 'Cross-domain insights' },
    { icon: Shield, label: 'Secure Access', desc: 'Enterprise-grade security' },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-deep-900 via-ocean-900 to-marine-900" />
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, rgba(8, 145, 178, 0.3) 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, rgba(16, 185, 129, 0.2) 0%, transparent 50%)`,
        }} />
      </div>
      
      {/* Animated Waves */}
      <div className="absolute bottom-0 left-0 right-0 h-64 opacity-20">
        <svg className="absolute bottom-0 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path 
            fill="currentColor" 
            className="text-ocean-400 animate-pulse"
            d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          />
        </svg>
        <svg className="absolute bottom-0 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path 
            fill="currentColor" 
            className="text-ocean-500"
            style={{ animationDelay: '0.5s' }}
            d="M0,256L48,261.3C96,267,192,277,288,261.3C384,245,480,203,576,197.3C672,192,768,224,864,234.7C960,245,1056,235,1152,213.3C1248,192,1344,160,1392,144L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          />
        </svg>
      </div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '50px 50px',
      }} />

      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${5 + Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative min-h-screen flex">
        {/* Left Section - Branding */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 flex-col justify-center px-12 xl:px-24">
          <div className="max-w-lg">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm">
                <Waves className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">CMLRE</h1>
                <p className="text-sm text-ocean-200">Marine Platform</p>
              </div>
            </div>
            
            <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
              Discover the <span className="text-ocean-300">Ocean's</span> Secrets
            </h2>
            <p className="text-lg text-ocean-100/80 mb-12">
              Advanced marine research platform for biodiversity monitoring, 
              ecological analysis, and ocean conservation.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, idx) => (
                <div 
                  key={idx}
                  className="p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <feature.icon className="w-6 h-6 text-ocean-300 mb-2" />
                  <h3 className="font-semibold text-white text-sm">{feature.label}</h3>
                  <p className="text-xs text-ocean-200/70 mt-0.5">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Section - Login Form */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
              <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm">
                <Waves className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">CMLRE</h1>
                <p className="text-xs text-ocean-200">Marine Platform</p>
              </div>
            </div>

            <Card variant="glass" className="bg-white/90 backdrop-blur-xl border-white/10 shadow-xl">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl text-deep-900">Welcome Back</CardTitle>
                <CardDescription className="text-deep-500">
                  Sign in to access your marine research dashboard
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-medium text-deep-700">
                      Email Address
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@cmlre.gov.in"
                      icon={<Mail className="w-4 h-4" />}
                      required
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="block text-sm font-medium text-deep-700">
                        Password
                      </label>
                      <button type="button" className="text-xs text-ocean-600 hover:text-ocean-700 font-medium">
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      icon={<Lock className="w-4 h-4" />}
                      required
                      className="h-12"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="remember" 
                      className="w-4 h-4 rounded border-gray-300 text-ocean-600 focus:ring-ocean-500"
                    />
                    <label htmlFor="remember" className="text-sm text-deep-600">
                      Remember me for 30 days
                    </label>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base" 
                    variant="premium"
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        Sign In
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    )}
                  </Button>
                </form>

                <div className="mt-8">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-white text-deep-400">Demo Credentials</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-ocean-50 rounded-xl border border-ocean-100">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-ocean-100">
                        <Shield className="w-4 h-4 text-ocean-600" />
                      </div>
                      <div className="text-sm">
                        <p className="font-medium text-deep-700">Test Account</p>
                        <p className="text-deep-500 mt-0.5">admin@cmlre.gov.in</p>
                        <p className="text-deep-500">cmlre2024</p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-6 text-center text-sm text-deep-500">
                  Need access?{' '}
                  <button type="button" className="text-ocean-600 hover:text-ocean-700 font-medium">
                    Contact Administrator
                  </button>
                </p>
              </CardContent>
            </Card>

            <p className="mt-8 text-center text-xs text-ocean-200/60">
              Centre for Marine Living Resources and Ecology • Ministry of Earth Sciences
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
