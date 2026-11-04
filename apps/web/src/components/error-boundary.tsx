'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps a failing widget (chat, notifications, a peer card) from taking the whole page down.
 * Shows `fallback` (or nothing) and logs the error with the component stack.
 */
export class ErrorBoundary extends Component<{ name: string; fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[flatmeta] ${this.props.name} crashed: ${error.message}`, info.componentStack);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
