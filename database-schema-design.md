# Client Portal Database Schema Design

## Tables Overview

### 1. clients
Stores client/customer information from intake form

| Column | Type | Description |
|--------|------|-------------|
| id | int (PK, auto) | Unique client ID |
| userId | int (FK to users) | Links to auth user account |
| fullName | varchar(255) | Client's full name |
| email | varchar(320) | Client's email |
| phone | varchar(50) | Client's phone number |
| businessName | varchar(255) | Business name |
| businessWebsite | varchar(500) | Business website URL |
| industry | varchar(255) | Business industry/category |
| businessAddress | text | Business physical address |
| targetLocation | text | Service area/target location |
| servicesOffered | text | Services the business offers |
| cmsType | varchar(100) | Website CMS (WordPress, Wix, etc.) |
| hasGoogleProfile | boolean | Whether they have existing GBP |
| googleProfileUrl | varchar(500) | Existing GBP URL if any |
| competitors | text | Competitor URLs (comma-separated) |
| additionalGoals | text | Additional client goals/notes |
| createdAt | timestamp | When client signed up |
| updatedAt | timestamp | Last updated |

### 2. orders
Tracks package purchases

| Column | Type | Description |
|--------|------|-------------|
| id | int (PK, auto) | Unique order ID |
| clientId | int (FK to clients) | Which client placed order |
| packageType | enum('jumpstart', 'dominator') | Which package purchased |
| price | decimal(10,2) | Amount paid |
| status | enum('pending', 'processing', 'in_progress', 'completed', 'cancelled') | Order status |
| stripePaymentId | varchar(255) | Stripe payment intent ID |
| createdAt | timestamp | Order date |
| completedAt | timestamp | When all deliverables finished |

### 3. deliverables
Individual work items for each order

| Column | Type | Description |
|--------|------|-------------|
| id | int (PK, auto) | Unique deliverable ID |
| orderId | int (FK to orders) | Which order this belongs to |
| deliverableType | varchar(100) | Type (ai_assessment, schema_markup, etc.) |
| title | varchar(255) | Human-readable title |
| description | text | What this deliverable includes |
| status | enum('pending', 'in_progress', 'completed', 'blocked') | Current status |
| fileUrl | varchar(500) | S3 URL to downloadable file (PDF, etc.) |
| completedAt | timestamp | When finished |
| notes | text | Internal notes or client-facing instructions |

### 4. client_credentials
Securely stores access credentials (encrypted)

| Column | Type | Description |
|--------|------|-------------|
| id | int (PK, auto) | Unique credential ID |
| clientId | int (FK to clients) | Which client |
| credentialType | enum('website_cms', 'google_account', 'domain_registrar', 'other') | Type of access |
| serviceName | varchar(255) | e.g., "WordPress", "GoDaddy" |
| username | text (encrypted) | Login username/email |
| password | text (encrypted) | Login password |
| additionalInfo | text (encrypted) | Any extra info (2FA codes, etc.) |
| isVerified | boolean | Whether we've successfully used it |
| createdAt | timestamp | When provided |

### 5. action_items
Things the client needs to do (verify GBP, etc.)

| Column | Type | Description |
|--------|------|-------------|
| id | int (PK, auto) | Unique action ID |
| orderId | int (FK to orders) | Which order |
| actionType | enum('verify_gbp', 'provide_credentials', 'review_content', 'other') | Type of action |
| title | varchar(255) | e.g., "Verify Google Business Profile" |
| description | text | Instructions for client |
| status | enum('pending', 'completed') | Whether done |
| completedAt | timestamp | When client completed it |

### 6. progress_log
Audit trail of work completed

| Column | Type | Description |
|--------|------|-------------|
| id | int (PK, auto) | Unique log ID |
| orderId | int (FK to orders) | Which order |
| deliverableId | int (FK to deliverables, nullable) | Related deliverable if any |
| message | text | What happened |
| createdAt | timestamp | When it happened |

## Relationships

- clients.userId → users.id (one-to-one, for auth)
- orders.clientId → clients.id (one-to-many)
- deliverables.orderId → orders.id (one-to-many)
- client_credentials.clientId → clients.id (one-to-many)
- action_items.orderId → orders.id (one-to-many)
- progress_log.orderId → orders.id (one-to-many)

## Deliverable Types (Package 1 - AI Jumpstart)

1. `ai_needs_assessment` - Initial audit and analysis
2. `schema_markup` - Code snippets for website
3. `citation_audit` - Spreadsheet of directory listings
4. `ai_visibility_report` - Current AI recommendation status
5. `review_strategy` - Templates and guidance
6. `website_assessment` - Content optimization recommendations

## Deliverable Types (Package 2 - AI Dominator)

All of Package 1, plus:
7. `gbp_optimization` - Google Business Profile work
8. `content_optimization` - Rewritten website copy
9. `advanced_schema` - Service-level schema markup
10. `competitor_analysis` - Deep dive report
11. `social_proof_strategy` - Multi-platform review strategy
12. `followup_checkin_1` - 15-day check-in report
13. `followup_checkin_2` - 30-day check-in report
