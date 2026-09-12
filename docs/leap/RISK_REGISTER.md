# skipwait.me — Risk Register

> Living document. Review at each checkpoint.

---

## Critical Risks

### R1: Container Cold Start Latency
| Field | Detail |
|---|---|
| **Severity** | High |
| **Probability** | Medium |
| **Trigger** | First API request after 10min inactivity |
| **Impact** | API TTFB spikes to ~1.6s; user sees slow page loads |
| **Early Warning** | Health endpoint shows old commitSha for >12min after deploy |
| **Mitigation** | Keep-warm cron job pings /api/health every 5min (not yet implemented) |
| **Rollback** | Remove cron job if it causes cost issues |
| **Owner** | DevOps |
| **Status** | ⚠️ Mitigation pending |

### R2: Schema Reconciliation Failure
| Field | Detail |
|---|---|
| **Severity** | High |
| **Probability** | Low |
| **Trigger** | New migration needs ALTER TABLE; Azure MySQL user lacks privileges |
| **Impact** | New features silently fail; schemaReconciled=false in health |
| **Early Warning** | /api/health shows schemaReconciled:false |
| **Mitigation** | Admin can trigger reconcile via /admin/schema → "Run reconcile" button |
| **Rollback** | Use Azure Query Editor to apply DDL manually (§4 of B2B_HANDOFF.md) |
| **Owner** | Database Admin |
| **Status** | ✅ Mitigation in place |

### R3: Debug Scripts Regression
| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Probability** | Low |
| **Trigger** | Future index.html edit re-introduces title-overwriting scripts |
| **Impact** | Page titles show ROOT:… or ERR:… instead of real titles; SEO damage |
| **Early Warning** | Design Gate CI catches document.title assignments in index.html |
| **Mitigation** | Design Gate blocks merges with document.title in HTML |
| **Rollback** | Revert the PR that reintroduced them |
| **Owner** | Frontend |
| **Status** | ✅ Prevention in place |

### R4: SEO Crawl Budget Waste
| Field | Detail |
|---|---|
| **Severity** | Medium |
| **Probability** | Medium |
| **Trigger** | Sitemap includes too many low-value URLs; Googlebot wastes crawl budget |
| **Impact** | Important pages crawled less frequently |
| **Early Warning** | Google Search Console shows crawl rate drop or indexing issues |
| **Mitigation** | Sitemap filtered to public routes + active jobs only; no auth-gated pages |
| **Rollback** | Reduce sitemap to static routes only |
| **Owner** | SEO |
| **Status** | ✅ Acceptable risk |

### R5: Payment Integration Instability
| Field | Detail |
|---|---|
| **Severity** | High |
| **Probability** | Low |
| **Trigger** | Razorpay/PayPal webhook failures; Chargebee API downtime |
| **Impact** | Users pay but don't get premium; refund requests |
| **Early Warning** | /api/health paymentFulfillment count drops; admin alerts |
| **Mitigation** | Webhook retry logic; admin manual refund flow |
| **Rollback** | Pause premium features; offer manual billing |
| **Owner** | Payments |
| **Status** | ✅ Mitigation in place |

### R6: Anonymity Breach
| Field | Detail |
|---|---|
| **Severity** | Critical |
| **Probability** | Very Low |
| **Trigger** | API accidentally returns email/name in public endpoint |
| **Impact** | Referrer identity exposed; trust destroyed |
| **Early Warning** | Automated tests check anonymity invariant; CI blocks PII in public APIs |
| **Mitigation** | All public endpoints use displayRef (Ref-XXXX, Talent-XXXX); never expose email |
| **Rollback** | Hotfix to strip PII from response; notify affected users |
| **Owner** | Security |
| **Status** | ✅ Prevention in place |

---

## Review Schedule

- **Weekly**: R1 (cold start), R4 (SEO)
- **Monthly**: R2 (schema), R3 (debug scripts), R5 (payments)
- **Quarterly**: R6 (anonymity)

---

*Last updated: 2026-09-12*
