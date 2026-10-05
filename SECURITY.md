# Security Policy 

## Supported versions 

FlowPlan is actively developed. Security fixes are primarily applied to the 
current development version. 

## Reporting a vulnerability 

Please do not publicly disclose security vulnerabilities through GitHub 
issues. 

Security vulnerabilities should be reported privately to the project 
maintainer through the security contact or private reporting mechanism 
provided by the repository. 

Please include: 

- A description of the vulnerability.
- Steps to reproduce it.
- The affected component or version.
- The potential security impact.
- Suggested mitigation, if known.

Do not include real passwords, API keys, session tokens, personal data, or 
other sensitive information in a report. 

## Security areas 

Security reports are particularly relevant to: 

- Authentication and session handling.
- Organization-level authorization.
- Project membership and role enforcement.
- Project and task access control.
- API authorization.
- Input validation.
- Database access.
- Comment and activity functionality.
- Dependency vulnerabilities.
- Secret and credential handling.
- Cross-organization data isolation.

## Authorization model 

FlowPlan uses organization and project boundaries to control access to 
resources. 

Changes affecting authorization should be reviewed carefully to ensure that 
users cannot access, modify, or delete resources outside their permitted 
scope.

## Responsible disclosure 

Please allow reasonable time for the maintainer to investigate and address 
a vulnerability before publicly disclosing technical details. 

Valid security reports may be acknowledged after investigation and 
resolution.
