---
description: Development Rules and Guidelines for PulseOps V3
---

# Development Rules - PulseOps V3

## Module Development Guidelines

### 🔧 Module Building Rules

#### **DO NOT REBUILD MODULES AUTOMATICALLY**
- **NEVER** automatically rebuild modules after making changes
- **ONLY** rebuild modules when explicitly requested by user
- **ALWAYS** ask user before running `npm run build:module <module_name>`
- **EXCEPTION**: Only rebuild if user explicitly says "rebuild" or "build the module"

#### **When to Ask for Rebuild:**
- After changing API routes (*.js files in api/)
- After changing UI components (*.jsx files in ui/)
- After changing configuration files (manifest.jsx, constants.json)
- After changing database schema files

#### **When NOT to Rebuild:**
- After adding comments or documentation
- After minor formatting changes
- After debugging analysis
- When user is still making multiple changes

### 🛠️ Development Workflow

#### **Code Changes:**
1. Make the requested code changes
2. **DO NOT** rebuild automatically
3. **WAIT** for user to request rebuild
4. Only rebuild when user explicitly asks

#### **User Communication:**
- **ALWAYS** inform user when changes are ready
- **ALWAYS** mention that rebuild is needed
- **NEVER** rebuild without explicit permission
- **ASK**: "Would you like me to rebuild the module now?"

### 📝 Module File Types

#### **API Files** (require rebuild):
- `api/routes/*.js`
- `api/lib/*.js`
- `api/config/*.json`
- `api/index.js`

#### **UI Files** (require rebuild):
- `ui/components/*.jsx`
- `ui/views/*.jsx`
- `ui/config/*.json`
- `ui/manifest.jsx`

#### **Files That Don't Need Rebuild:**
- `database/*.json`
- Documentation files
- Test files
- README files

### 🎯 Exception Cases

#### **Automatic Rebuild Allowed:**
- User explicitly says: "rebuild it", "build the module", "apply changes"
- User says: "test it" (implies rebuild needed)
- Hot-reload fails and user asks to fix it

#### **Manual Rebuild Required:**
- User says: "make changes", "update this", "fix this"
- Any code changes without explicit rebuild request

### 📋 Example Interactions

#### **❌ Wrong (Auto-Rebuild):**
```
User: "Fix the logging issue"
AI: *Makes changes*
AI: *Automatically rebuilds module* ❌
```

#### **✅ Correct (Ask First):**
```
User: "Fix the logging issue"
AI: *Makes changes*
AI: "I've fixed the logging issue in the ClusterConfigTab. Would you like me to rebuild the module now?" ✅
```

### 🔍 Module-Specific Rules

#### **Accessio Ops Module:**
- Always ask before rebuilding after Kubernetes client changes
- Wait for user confirmation after API route modifications
- Check with user before rebuilding after UI component updates

#### **Google GKE Module:**
- Similar rules apply to all modules
- Consistent behavior across all module development

### 🚀 Quick Reference

| Action | Auto-Rebuild? | User Confirmation Required? |
|--------|---------------|----------------------------|
| Code changes | ❌ NO | ✅ YES |
| Documentation | ❌ NO | ❌ NO |
| User says "rebuild" | ✅ YES | ❌ NO |
| User says "test it" | ✅ YES | ❌ NO |
| User says "fix it" | ❌ NO | ✅ YES |

---

**Remember:** When in doubt, ASK the user before rebuilding!
