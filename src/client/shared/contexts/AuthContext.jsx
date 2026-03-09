// ============================================================================
// AuthContext — PulseOps V2
//
// PURPOSE: Global authentication context providing user state, role, and
// permission-based helpers to all components. Implements RBAC by exposing
// role and permission check utilities derived from the authenticated user.
//
// ROLE HIERARCHY:
//   super_admin > admin > operator > user > viewer
//
// USAGE:
//   const { user, role, isSuperAdmin, hasRole, can } = useAuthContext();
//
// ROLE CHECKS:
//   hasRole('admin')              → true if role === 'admin'
//   hasRole(['admin','operator']) → true if role is in the array
//   isSuperAdmin                  → shorthand for role === 'super_admin'
//   can('database:manage')        → true if role has that permission
// ============================================================================
import React, { createContext, useContext, useMemo } from 'react';

// ── Permission matrix per role ──────────────────────────────────────────────
const ROLE_PERMISSIONS = {
  super_admin: [
    'platform:admin', 'settings:read', 'settings:write', 'database:manage',
    'modules:manage', 'users:manage', 'logs:read', 'logs:delete', 'reports:read',
  ],
  admin: [
    'platform:admin', 'settings:read', 'settings:write', 'database:manage',
    'modules:manage', 'users:manage', 'logs:read', 'logs:delete', 'reports:read',
  ],
  operator: ['settings:read', 'logs:read', 'reports:read'],
  user:     ['reports:read'],
  viewer:   ['reports:read'],
};

// ── RBAC helpers ─────────────────────────────────────────────────────────────

function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function roleHasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

/**
 * AuthProvider wraps the app and exposes auth state + RBAC helpers.
 * @param {Object} props - { user, children }
 */
export function AuthProvider({ user, children }) {
  const value = useMemo(() => {
    const role = user?.role || 'viewer';
    const permissions = getPermissionsForRole(role);

    return {
      user,
      role,
      permissions,

      // Convenience booleans
      isSuperAdmin: role === 'super_admin',
      isAdmin:      role === 'admin' || role === 'super_admin',
      isOperator:   role === 'operator' || role === 'admin' || role === 'super_admin',

      /**
       * Check if the user has one of the specified roles.
       * @param {string|string[]} roles
       */
      hasRole(roles) {
        const list = Array.isArray(roles) ? roles : [roles];
        return list.includes(role);
      },

      /**
       * Check if the user has a specific permission.
       * @param {string} permission - e.g. 'database:manage'
       */
      can(permission) {
        return roleHasPermission(role, permission);
      },

      /**
       * Check if the user has ALL of the specified permissions.
       * @param {string[]} permList
       */
      canAll(permList) {
        return permList.every(p => roleHasPermission(role, p));
      },

      /**
       * Check if the user has ANY of the specified permissions.
       * @param {string[]} permList
       */
      canAny(permList) {
        return permList.some(p => roleHasPermission(role, p));
      },
    };
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to consume the AuthContext.
 * Must be used inside an AuthProvider.
 */
export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used inside <AuthProvider>');
  }
  return ctx;
}

export default AuthContext;
