'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useForm } from 'react-hook-form';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { FaGoogle, FaEye, FaEyeSlash, FaCheck } from 'react-icons/fa';

// v2.0 - Fixed TensorFlow initialization

interface RegisterFormData {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

export default function RegisterPage() {
  const { signUp, signInWithGoogle, user } = useAuth();
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>();

  const password = watch('password');

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      await signUp(data.email, data.password, data.displayName);
    } catch (error) {
      // Error is already handled in useAuth hook
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      // Error is already handled in useAuth hook
    } finally {
      setIsLoading(false);
    }
  };

  // Password strength indicator
  const getPasswordStrength = (password: string) => {
    if (!password) return { strength: 0, text: '', color: '' };

    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const strengthLevels = [
      { strength: 0, text: 'Too weak', color: 'bg-error' },
      { strength: 1, text: 'Weak', color: 'bg-error' },
      { strength: 2, text: 'Fair', color: 'bg-warning' },
      { strength: 3, text: 'Good', color: 'bg-success' },
      { strength: 4, text: 'Strong', color: 'bg-success' },
    ];

    return strengthLevels[strength];
  };

  const passwordStrength = getPasswordStrength(password);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="max-w-md w-full space-y-8">
        {/* Logo and Title */}
        <div className="text-center">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-bold gradient-text">CryptoSuccess</h1>
          </Link>
          <h2 className="mt-6 text-3xl font-bold text-white">Create your account</h2>
          <p className="mt-2 text-text-secondary">
            Start getting AI-powered trading signals today
          </p>
        </div>

        {/* Register Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            {/* Display Name Field */}
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-text-secondary mb-2">
                Full name
              </label>
              <input
                {...register('displayName', {
                  required: 'Full name is required',
                  minLength: {
                    value: 2,
                    message: 'Name must be at least 2 characters',
                  },
                })}
                type="text"
                autoComplete="name"
                className={`input ${errors.displayName ? 'input-error' : ''}`}
                placeholder="Enter your full name"
              />
              {errors.displayName && (
                <p className="mt-1 text-sm text-error">{errors.displayName.message}</p>
              )}
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
                Email address
              </label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
                type="email"
                autoComplete="email"
                className={`input ${errors.email ? 'input-error' : ''}`}
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-error">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 8,
                      message: 'Password must be at least 8 characters',
                    },
                    validate: {
                      hasUpperCase: (value) =>
                        /[A-Z]/.test(value) || 'Password must contain at least one uppercase letter',
                      hasNumber: (value) =>
                        /\d/.test(value) || 'Password must contain at least one number',
                    },
                  })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input pr-10 ${errors.password ? 'input-error' : ''}`}
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                >
                  {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-error">{errors.password.message}</p>
              )}

              {/* Password Strength Indicator */}
              {password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-secondary">Password strength</span>
                    <span className="text-xs text-text-secondary">{passwordStrength.text}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`${passwordStrength.color} h-1.5 rounded-full transition-all duration-300`}
                      style={{ width: `${(passwordStrength.strength / 4) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary mb-2">
                Confirm password
              </label>
              <div className="relative">
                <input
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (value) =>
                      value === password || 'Passwords do not match',
                  })}
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                >
                  {showConfirmPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-error">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Terms and Conditions */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  {...register('acceptTerms', {
                    required: 'You must accept the terms and conditions',
                  })}
                  type="checkbox"
                  className="h-4 w-4 bg-surface border-gray-600 rounded focus:ring-primary focus:ring-offset-0"
                />
              </div>
              <div className="ml-2 text-sm">
                <label htmlFor="acceptTerms" className="text-text-secondary">
                  I agree to the{' '}
                  <Link href="/terms" className="text-primary hover:text-primary-light">
                    Terms and Conditions
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-primary hover:text-primary-light">
                    Privacy Policy
                  </Link>
                </label>
                {errors.acceptTerms && (
                  <p className="mt-1 text-sm text-error">{errors.acceptTerms.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary py-3 text-lg font-semibold"
          >
            {isLoading ? <LoadingSpinner size="small" /> : 'Create account'}
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-background text-text-secondary">Or sign up with</span>
            </div>
          </div>

          {/* Google Sign Up */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            className="w-full btn-secondary py-3 text-lg font-semibold flex items-center justify-center space-x-3"
          >
            <FaGoogle size={20} />
            <span>Continue with Google</span>
          </button>
        </form>

        {/* Sign In Link */}
        <p className="text-center text-text-secondary">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-primary hover:text-primary-light font-medium transition-colors"
          >
            Sign in
          </Link>
        </p>

        {/* Features List */}
        <div className="mt-8 space-y-2">
          <p className="text-sm text-text-secondary font-medium mb-3">With CryptoSuccess you get:</p>
          <div className="flex items-center space-x-2">
            <FaCheck className="text-success" size={16} />
            <span className="text-sm text-text-secondary">5 free AI trading signals daily</span>
          </div>
          <div className="flex items-center space-x-2">
            <FaCheck className="text-success" size={16} />
            <span className="text-sm text-text-secondary">Real-time market data</span>
          </div>
          <div className="flex items-center space-x-2">
            <FaCheck className="text-success" size={16} />
            <span className="text-sm text-text-secondary">Professional technical analysis</span>
          </div>
        </div>
      </div>
    </div>
  );
}