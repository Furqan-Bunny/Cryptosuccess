'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useForm } from 'react-hook-form';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { FaArrowLeft, FaEnvelope } from 'react-icons/fa';

interface ForgotPasswordFormData {
  email: string;
}

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>();

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    try {
      await resetPassword(data.email);
      setIsEmailSent(true);
    } catch (error) {
      // Error is already handled in useAuth hook
    } finally {
      setIsLoading(false);
    }
  };

  if (isEmailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
        <div className="max-w-md w-full text-center">
          <div className="mb-8">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-success/10 border border-success/20">
              <FaEnvelope className="text-success" size={24} />
            </div>
          </div>

          <h2 className="text-3xl font-bold text-white mb-4">Check your email</h2>
          <p className="text-text-secondary mb-8">
            We&apos;ve sent a password reset link to your email address. Please check your inbox and follow the instructions to reset your password.
          </p>

          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Didn&apos;t receive the email? Check your spam folder or{' '}
              <button
                onClick={() => setIsEmailSent(false)}
                className="text-primary hover:text-primary-light font-medium"
              >
                try again
              </button>
            </p>

            <Link
              href="/login"
              className="inline-flex items-center text-primary hover:text-primary-light font-medium"
            >
              <FaArrowLeft className="mr-2" size={16} />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="max-w-md w-full space-y-8">
        {/* Logo and Title */}
        <div className="text-center">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-bold gradient-text">CryptoSuccess</h1>
          </Link>
          <h2 className="mt-6 text-3xl font-bold text-white">Reset your password</h2>
          <p className="mt-2 text-text-secondary">
            Enter your email and we&apos;ll send you a link to reset your password
          </p>
        </div>

        {/* Forgot Password Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary py-3 text-lg font-semibold"
          >
            {isLoading ? <LoadingSpinner size="small" /> : 'Send reset link'}
          </button>

          {/* Back to Login Link */}
          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center text-primary hover:text-primary-light font-medium"
            >
              <FaArrowLeft className="mr-2" size={16} />
              Back to sign in
            </Link>
          </div>
        </form>

        {/* Help Text */}
        <div className="mt-8 p-4 bg-surface rounded-lg border border-gray-800">
          <p className="text-sm text-text-secondary">
            <strong className="text-white">Tip:</strong> Password reset links expire after 1 hour for security reasons. If your link has expired, you can request a new one.
          </p>
        </div>
      </div>
    </div>
  );
}