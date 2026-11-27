# NOVA LMS — Moodle Setup & OTHM Evidence Pack

Working document for the OTHM centre-approval request (point 3: *"LMS evidence / guest
access to your moodle platform"*), received 16 Nov 2026 from Rebecca Donaldson,
Academic Partnership Manager, OTHM Qualifications.

| | |
|---|---|
| **LMS URL** | `https://lms.novaenvironmentaldoha.com` |
| **Host** | Hostinger (same account as the main site) |
| **Platform** | Moodle (latest LTS) |
| **Linked from** | `pages/student-portal.html` → nav on all pages |

---

## ⚠️ Read this first: guest access is NOT enough

OTHM asked for *"guest access (login details) **or** a recorded walkthrough"*. Moodle's
built-in **guest access** lets a visitor browse course materials, but a guest user
**cannot**:

- submit an assignment
- see tutor feedback
- see a grade report
- have completion tracking recorded against them

That is **4 of the 6 things OTHM asked to see**.

**So do all three:**

1. A **demo learner account** (real account, enrolled on the course, with a submission
   and marked feedback already in place) — this is the primary evidence
2. **Guest access enabled** on the course as well — it costs nothing and matches the
   wording of their request
3. A **recorded walkthrough** showing the learner journey end to end

---

## Phase 1 — Hostinger setup  ✅ COMPLETE (24 Nov 2026)

Recorded as actually performed, not as originally planned — the two differ in
several places and the differences cost most of a day.

| | |
|---|---|
| Hosting account | `u249715049`, Premium Web Hosting, shell `in-mum-web1402` |
| Moodle | **5.3.1+ (Build 20261124)**, installed manually |
| Web root | `public_html/lms/public` |
| Moodle root | `public_html/lms` |
| moodledata | `~/domains/novaenvironmentaldoha.com/moodledata` (outside `public_html`) |

### 1.1 Subdomain — document root must point at `public/`
Moodle 5.x ships a **new directory structure**: the Moodle root holds `lib/`,
`bin/`, `config.php`, and the web-servable files live in `public/`. The root
`index.php` deliberately throws if reached, so a subdomain pointing at the Moodle
root serves nothing.

hPanel → **Domains → + Add** → subdomain `lms` → **Folder → Custom folder** →
```
lms/public
```
giving `/public_html/lms/public`.

> hPanel offers no way to change a subdomain's folder after creation — only
> *Manage DNS* and *Delete subdomain*. Set it correctly at creation, or delete and
> recreate (move the files out of `public_html` first; SSL then reissues).

Verify:
```bash
getent hosts lms.novaenvironmentaldoha.com
```
Expect `2a02:4780:...`. A reply ending in `.mwangroup.com` means no record exists
yet — that is the local resolver appending its search suffix.

### 1.2 PHP configuration
hPanel → **Advanced → PHP Configuration**. PHP 8.3.37 was already active.

**Extensions** — `sodium` is **off** by default and Moodle requires it. Also
confirm `intl`, `mbstring`, `gd`, `curl`, `zip`, `xml`, `soap`, `exif`, `opcache`.

**Options** — `max_input_vars` defaults to 1000; Moodle wants 5000. Set
`memory_limit 256M`, `max_execution_time 300`, `post_max_size 128M`,
`upload_max_filesize 128M`.

Leave `disableFunctions` alone. `exec`, `shell_exec` and `system` are blocked by
Hostinger and Moodle runs fine without them.

### 1.3 Hostinger Auto Installer does not work here
It lists Moodle, but refuses with:

> The selected version 5.3.1 is not compatible with the selected install location.
> Requirements: PHP sodium: enabled (detected: disabled) PHP functions: proc_open
> (detected: )

Enabling `sodium` clears the first. **`proc_open` cannot be cleared** — it is
blocked above the account and is absent from the editable `disableFunctions` list.

This is Hostinger's own requirement list, **not Moodle's**. Moodle installs and
runs without `proc_open`. Install manually instead.

### 1.4 Manual install over SSH
hPanel → **Advanced → SSH Access** → Enable, and set a password there.
```bash
ssh -p 65002 u249715049@89.116.133.130
```

```bash
cd ~/domains/novaenvironmentaldoha.com/public_html/lms
wget https://packaging.moodle.org/stable503/moodle-latest-503.zip
unzip -q moodle-latest-503.zip
mv moodle/* . 2>/dev/null; mv moodle/.[!.]* . 2>/dev/null
rmdir moodle; rm -f moodle-latest-503.zip
mkdir -p ~/domains/novaenvironmentaldoha.com/moodledata
chmod 777 ~/domains/novaenvironmentaldoha.com/moodledata
```

The server pulls the 150 MB archive in under a second. Uploading it through File
Manager is the slow, failure-prone alternative — avoid it.

> Set `moodledata` back to `755` once the install finishes.

### 1.4a moodledata — the installer puts it inside `public_html`

Creating `~/domains/novaenvironmentaldoha.com/moodledata` beforehand is not enough.
The web installer ignores it and defaults to:
```
/home/u249715049/domains/novaenvironmentaldoha.com/public_html/moodledata
```
which is **inside the web root**. Moodle drops a `deny from all` `.htaccess` there,
so files are not served — but that single file is the only thing standing between
learners' submitted assignments and the open web.

Check after installing, and move it if needed:
```bash
cd ~/domains/novaenvironmentaldoha.com
rmdir moodledata 2>/dev/null
mv public_html/moodledata ./moodledata
sed -i "s#public_html/moodledata#moodledata#" public_html/lms/config.php
rm -rf moodledata/localcache/* moodledata/cache/* moodledata/temp/*
grep -n dataroot public_html/lms/config.php
```

Clearing `localcache`, `cache` and `temp` matters — they hold absolute paths from
the old location. Confirm afterwards that `https://www.novaenvironmentaldoha.com/moodledata/`
returns **404**, not 403: 403 means it is still there, merely blocked.

### 1.5 Database — use `localhost`, and ignore the shell client
hPanel → **Databases → + Add database**. Set the password **in the creation form**;
the separate *Change password* action silently failed every time it was tried.

| Field | Value |
|---|---|
| Database | `u249715049_moodle` |
| User | `u249715049_moodle` |
| Password | set at creation, stored in the password manager |

**`mysql` from the SSH shell always returns `ERROR 1045 Access denied`, with any
host, user or password.** Hostinger blocks database access from the shell. It is
not a credentials problem and it is not worth debugging — PHP connects fine.

In the Moodle installer:

| Field | Value |
|---|---|
| Database host | `localhost` — *not* the `srv1402.hstgr.io` shown in hPanel |
| Database name / user | as above, **with the `u249715049_` prefix** |
| Tables prefix | `mdl_` |
| Port / socket | blank |

### 1.6 Driver must be `mariadb`, not `mysqli`
The server runs MariaDB 11.8.9. Choosing "Improved MySQL (native/mysqli)" in the
installer makes Server checks report:

> Wrong $CFG->dbtype. You need to change it in your config.php file from 'mysqli'
> to 'mariadb'.

Fix in `public_html/lms/config.php` (the Moodle root, not `public/`):
```bash
sed -i "s/'mysqli'/'mariadb'/" ~/domains/novaenvironmentaldoha.com/public_html/lms/config.php
```
Then reload Server checks.

### 1.7 SSL
Hostinger issues the Let's Encrypt certificate automatically within ~15 minutes of
the subdomain being created. Do not press *Cancel* while the status reads
*Installing*. Confirm `https://` loads before creating any accounts.

### 1.8 Cron
hPanel → **Advanced → Cron Jobs**, mode **PHP**. The command field is prefixed with
`/usr/bin/php /home/u249715049/`, so enter only the remainder — note the `public/`
segment, which is easy to miss:
```
domains/novaenvironmentaldoha.com/public_html/lms/public/admin/cli/cron.php
```

**Schedule: `0,30 * * * *`** (every 30 minutes). Hostinger's *Common Options* list
offers nothing more frequent than *Twice an hour* on this plan — there is no
5-minute or 1-minute preset.

> Pick the Common Option **before** touching the Minute/Hour dropdowns, then check
> the row in *List of Cron Jobs* before trusting it. A stale `Hour` value survives
> the preset and silently turns the schedule into *twice a day* (`0,30 5 * * *`).

Moodle prefers cron every minute. Thirty minutes is fine for centre approval —
notifications and submission receipts are simply delayed by up to half an hour.
Moving to a VPS later would allow a one-minute schedule.

> Without cron at all: no email notifications, no completion recalculation, no
> submission receipts. OTHM will notice.

### 1.9 Housekeeping
`public_html/nova-site-v2.zip` is publicly downloadable and exposes the whole
website source. Delete it.

## Phase 2 — Moodle core settings

| Setting | Where | Value |
|---|---|---|
| Full site name | Site admin → General → Site settings | NOVA Environmental Consulting — Learning Platform |
| Short name | same | NOVA LMS |
| Support email | same | novaconsultingdoha@gmail.com |
| **Enable completion tracking** | Site admin → Advanced features | **Yes** (required for OTHM point 5) |
| Enable badges | Advanced features | Optional |
| Logo & brand colour | Site admin → Appearance → Boost → Settings | Nova logo + site brand colours |
| Country / timezone | Location settings | Qatar / Asia/Qatar |
| Outgoing mail | Server → Email → Outgoing mail config | SMTP via the Hostinger mailbox |

Send a test email before going further — submission receipts and feedback
notifications depend on it.

### 2.1 Branding  ✅ COMPLETE (27 Nov 2026)

Applied via CLI, not the settings form — the form proved unreliable here:

```bash
cd ~/domains/novaenvironmentaldoha.com/public_html/lms
php admin/cli/cfg.php --component=theme_boost --name=brandcolor --set='#0B3D2E'
php admin/cli/cfg.php --component=theme_boost --name=scsspre --set="$(cat ~/nova-scsspre.scss)"
php admin/cli/cfg.php --component=theme_boost --name=scss     --set="$(cat ~/nova-scss.scss)"
```

Logos were uploaded through the web UI at `/admin/settings.php?section=logos`
(`images/nova-logo.png` and `images/nova-logo-compact.png`).

**Three traps, all of which cost time:**

1. **Never put `@import url(...)` in Raw SCSS.** Moodle's SCSS compiler treats it
   as a *file* import, fails to find it, and then — this is the damaging part —
   swallows the error with `debugging()` and silently serves Boost's prebuilt
   `theme/boost/style/moodle.css` instead. The site simply stays default blue
   with no error anywhere. The Inter webfont is loaded instead from
   Site admin → Appearance → Additional HTML → "Within HEAD"
   (`additionalhtmlhead`), as a `<link>` tag.

2. **Rebuild the theme CSS from the CLI after every cache purge.** The web
   request cannot complete the SCSS compile on this shared hosting and falls
   back to the prebuilt blue CSS, which then gets cached. Always run both
   together, and do not open the site in between:
   ```bash
   php admin/cli/purge_caches.php && php admin/cli/build_theme_css.php --themes=boost
   ```
   Verify: the built file under
   `moodledata/localcache/theme/<rev>/boost/css/all_*.css` should be ~1,349,500
   bytes and contain `0B3D2E`. The ~1,367,800-byte version is the unbranded
   fallback.

3. **To see why a theme change did nothing**, turn debugging on temporarily —
   the SCSS error is invisible otherwise:
   ```bash
   php admin/cli/cfg.php --name=debug --set=32767
   php admin/cli/cfg.php --name=debugdisplay --set=1
   # ... reproduce ...
   php admin/cli/cfg.php --name=debugdisplay --set=0
   php admin/cli/cfg.php --name=debug --set=0
   ```

Known cosmetic gap: Boost 5.3 sets `.navbar{display:none}`, so the gold rule
under the navbar does not render. The other gold accents (login card, footer)
do.

---

### 2.2 Outgoing mail (SMTP)  ✅ COMPLETE (27 Nov 2026)

Working settings (Site admin → Server → Email → Outgoing mail configuration):

| Setting | Value |
|---|---|
| `smtphosts` | `smtp.hostinger.com:465` |
| `smtpsecure` | `ssl` |
| `smtpauthtype` | `LOGIN` |
| `smtpuser` | `noreply@novaenvironmentaldoha.com` |
| `noreplyaddress` | `noreply@novaenvironmentaldoha.com` |

Two faults caused the "Your site couldn't communicate with your mail server"
error, and neither was visible in the web form:

1. **A trailing space in `smtphosts`** (`smtp.hostinger.com:465 `). Moodle takes
   it as part of the hostname and the connection fails. `php admin/cli/cfg.php`
   is the only place this shows up.
2. **`noreplyaddress` pointed at a mailbox that does not exist**
   (`noreply@lms.…` instead of `noreply@…`). Hostinger's SMTP refuses to send
   from any address other than the authenticated mailbox. This is why a raw
   `curl smtps://…` test succeeded while Moodle failed — curl used the real
   address.

Test from the CLI rather than the web form, which hides the reason:

```bash
php admin/cli/cfg.php --name=debug --set=32767
php admin/cli/cfg.php --name=debugdisplay --set=1
php -r 'define("CLI_SCRIPT",true); require("config.php");
  $u = $DB->get_record("user", ["username"=>"rk.niazi840"]);
  var_dump(email_to_user($u, core_user::get_noreply_user(), "test", "body"));'
php admin/cli/cfg.php --name=debugdisplay --set=0
php admin/cli/cfg.php --name=debug --set=0
```

> **To do:** the mailbox password has appeared in terminal output and shell
> history. Rotate it in hPanel → Emails, set the new one with
> `php admin/cli/cfg.php --name=smtppass --set='…'`, then clear the history.

---

## Phase 3 — Course blueprint

Build **one complete unit** properly rather than several empty ones. OTHM is
assessing quality of delivery, not volume.

Course format: **Topics**. Course settings → **Completion tracking: Yes**.

```
COURSE: <OTHM qualification name and level>
│
├── Topic 0 — Start Here (induction)
│   ├── Announcements                      (forum — created by default)
│   ├── Student Handbook                   (file)
│   ├── Course Delivery Schedule           (file)
│   ├── Assessment Policy                  (file)
│   ├── Plagiarism & Academic Integrity    (file)
│   ├── Learner Support — who to contact   (page)
│   └── Induction Checklist                (page, completion: manual tick)
│
└── Topic 1 — <Unit title>                 ← OTHM will inspect this one
    │
    ├── ■ LEARNING MATERIALS               (label, used as a visual divider)
    │   ├── Unit specification             (file)
    │   ├── Lecture 1 slides               (file)
    │   ├── Lecture 2 slides               (file)
    │   ├── Recorded session               (URL or file)
    │   └── Reading list                   (page)
    │
    ├── ■ ASSESSMENT                       (label)
    │   ├── Assignment Brief — Unit 1       (file)   ← OTHM point 2
    │   ├── Assessment criteria / grid      (file)
    │   └── Assignment 1 — Submission       (ASSIGNMENT activity)  ← points 3 & 4
    │
    └── ■ YOUR PROGRESS                    (label)
        └── Grade report link / completion info       ← point 5
```

### The Assignment activity (carries points 3 and 4)
Settings that matter:

- **Submission types:** File submissions, max 3 files, PDF/DOCX
- **Due date:** set, and in the future
- **Cut-off date:** set
- **Submission statement:** ON — learner declares the work is their own
  (OTHM looks for this as plagiarism control)
- **Notifications:** notify graders of submissions → Yes
- **Feedback types:** Feedback comments + Annotate PDF + Feedback files
- **Grading method:** **Marking guide** or **Rubric**, built from the OTHM
  assessment criteria — a plain numeric grade is weaker evidence

### Completion tracking (point 5)
- Learning material files → completion: *view*
- Assignment → completion: *submit / receive a grade*
- Add the **Course completion status** block to the course page
- Confirm **Grades → User report** renders correctly for the demo learner
- Optional: the third-party *Progress Bar* block (`block_progress`) gives a clearer
  visual, but core completion is sufficient evidence

---

## Phase 4 — Accounts

| Account | Role | Purpose |
|---|---|---|
| `admin` | Site administrator | Rizwan / technical |
| *(tutor name)* | Teacher, enrolled on the course | Marks the demo submission |
| `demo.learner` | Student, enrolled on the course | **The account given to OTHM** |
| Guest access | — | Enabled on the course, password optional |

Create the demo learner with a realistic name, not "test test".

---

## Phase 5 — Seed the evidence

Points 4 and 5 cannot be demonstrated by an empty course. Before sending anything
to OTHM:

1. Log in as `demo.learner` → upload a short sample assignment to Assignment 1
2. Log in as the tutor → mark it using the rubric, write real feedback comments,
   annotate the PDF, release the grade
3. Log back in as `demo.learner` → confirm the feedback, grade and rubric are visible
4. Confirm the progress indicator and grade report now show movement

---

## Phase 6 — Walkthrough recording (5–8 minutes)

Record as the **demo learner**, screen only, in this order:

| # | Shot | Covers |
|---|---|---|
| 1 | Log in at `lms.novaenvironmentaldoha.com` → dashboard → open the course | — |
| 2 | Topic 0 — handbook, schedule, policies, support contacts | point 6 |
| 3 | Topic 1 → Learning Materials → open a slide deck | point 1 |
| 4 | Open the Assignment Brief | point 2 |
| 5 | Open the Assignment activity → show the upload area, due date, submission statement | point 3 |
| 6 | Show the submitted file and its timestamp | point 3 |
| 7 | Open the tutor feedback — comments, annotated PDF, completed rubric | point 4 |
| 8 | Show completion ticks, the completion block, then Grades → user report | point 5 |
| 9 | Announcements forum | point 6 |

Narrate each step briefly. Export as MP4 and upload somewhere OTHM can stream it
(unlisted YouTube or Google Drive link).

---

## Phase 7 — Pre-send checklist

- [ ] `https://` loads with a valid certificate, no mixed-content warnings
- [ ] Nova logo and branding visible
- [ ] Cron running (Site admin → Server → Tasks → Scheduled tasks shows recent runs)
- [ ] Test email delivered successfully
- [ ] Demo learner can log in from a private browser window
- [ ] Marked submission with visible feedback and rubric in place
- [ ] Completion ticks and grade report both showing data
- [ ] Guest access enabled on the course
- [ ] `moodledata` confirmed outside `public_html`
- [ ] "Student Portal" link on the main site resolves correctly
- [ ] Main website deployed **only after** the LMS is live

---

## Outstanding — needed from the client

Nothing below can be produced by the developer; it must come from the academic team.

- [ ] **OTHM's deadline for the response** ← most urgent
- [ ] Qualification name and level
- [ ] OTHM qualification specification
- [ ] Assignment brief(s) — OTHM supplies these to approved centres
- [ ] Teaching materials for at least one unit
- [ ] Student Handbook
- [ ] Assessment and plagiarism policies
- [ ] Academic calendar / delivery schedule
- [ ] Tutor name and email
- [ ] High-resolution Nova logo

**Timeline: 5 working days from the date the content above is received** — not from
the date the request was made.

---

## Reply to OTHM (send once Phase 7 is complete)

> Dear Rebecca,
>
> Further to your email regarding our centre approval, please find below our response
> to point 3 (LMS evidence).
>
> Our learning platform is available at **https://lms.novaenvironmentaldoha.com**
>
> **Learner account for your review:**
> Username: `demo.learner`
> Password: *(sent separately)*
>
> This account is enrolled on *<qualification name>* and includes a submitted
> assignment with tutor feedback already in place, so that the full learner journey
> can be reviewed.
>
> A recorded walkthrough is also available here: *<link>*
>
> The walkthrough covers each of the areas you asked us to highlight:
>
> - **Teaching materials** — Learning Materials section within each unit
> - **Assignment briefs** — published in the Assessment section of each unit
> - **Assignment submission** — Moodle Assignment activity with deadline, file upload
>   and a submission statement
> - **Tutor feedback** — written feedback, annotated submissions and a completed
>   marking guide, released to the learner
> - **Progress tracking** — activity completion tracking and the learner's grade report
> - **Other key information** — Student Handbook, delivery schedule, assessment and
>   plagiarism policies, announcements and learner support contacts, all available in
>   the induction section
>
> Guest access has also been enabled on the course should you prefer to browse without
> signing in, though please note that guest users cannot view submissions, feedback or
> progress data — the learner account above is required for those.
>
> Please let us know if you require any further evidence.
>
> Kind regards,
> *<name>*
> NOVA Environmental Consulting
