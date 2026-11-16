# SIAKHLAK Security Specification (Firestore RBAC)

## 1. Data Invariants
1. **Default-Deny Baseline**: Every unspecified document path is denied (`allow read, write: if false`).
2. **Verified Identity**: All reads/writes require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Privilege Separation (Komite Pendidikan Agama)**:
   - `komite_pendidikan_agama` can read aggregate unit metrics (`unitAggregates`, `religiousPrograms`, `units`, `academicPeriods`), and create/manage `komiteFindings`, `komiteMeetings`, `komiteDecisions`, and `komiteReports`.
   - `komite_pendidikan_agama` is strictly FORBIDDEN from writing `students`, `teachers`, `classes`, `units`, `systemConfig`, `academicPeriods`, `unitAggregates`, or `studentAssessments` (including `verificationStatus`).
   - `komite_pendidikan_agama` is strictly FORBIDDEN from reading `students` or `studentAssessments` unless `users/{uid}.allowIndividualStudentAccess == true` (which only `yayasan` can toggle).
4. **Action-Based Updates & Terminal State Integrity**:
   - All updates enforce `isValid[Entity](incoming())` and `affectedKeys().hasOnly(...)` per role action.
   - `createdAt` and `createdBy`/`uid` are immutable on updates; `createdAt == request.time` on creates and `updatedAt == request.time` on updates.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unverified Email Spoof**: Request with matching admin email where `email_verified == false`.
2. **Komite Self-Grant Individual Student Access**: Komite user attempting `update` on `/users/{uid}` changing `allowIndividualStudentAccess: true`.
3. **Komite Escalating Own Role**: Komite user attempting `update` on `/users/{uid}` changing `role: 'yayasan'`.
4. **Komite Reading Students Without Grant**: Komite user with `allowIndividualStudentAccess: false` querying `/students` or `/studentAssessments`.
5. **Komite Modifying Student Score**: Komite user (even with read grant) attempting `update` on `/studentAssessments/{id}` changing `scores` or `verificationStatus`.
6. **Komite Modifying Master Unit/Class/Teacher**: Komite user attempting `create`/`update` on `/units/SMP`, `/classes/c1`, or `/teachers/t1`.
7. **Komite Modifying System Config**: Komite user attempting `update` on `/systemConfig/main`.
8. **Guru Modifying Komite Finding Analysis**: Guru user attempting `update` on `/komiteFindings/{id}` modifying `findingDetail` or `komiteEvaluationNote`.
9. **Shadow Ghost Field Injection**: Creating `/komiteFindings/{id}` with extra undocumented field `isOverride: true`.
10. **ID Poisoning**: Creating document with 500-character ID or invalid characters (`../admin`).
11. **Timestamp Forgery**: Creating or updating any document with backdated `createdAt` or `updatedAt != request.time`.
12. **PII Leak via Blanket User List**: Non-admin (`guru` or `komite_pendidikan_agama`) attempting `list` on `/users` collection.
