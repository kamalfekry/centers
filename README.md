# Centers Attendance

## العربية

### المشروع جاهز لرفع Azure؟

نعم. المشروع الحالي مجهز للعمل على:

- `Azure Static Web Apps` للواجهة
- `Azure Functions` للباك إند
- `Azure Table Storage` لتخزين السجلات والموظفين والإعدادات وسجل التعديلات
- `Azure Blob Storage` لتخزين صور الدخول والخروج

### هيكل المشروع

- الواجهة الأمامية في جذر المشروع:
  - `index.html`
  - `welcome.html`
  - `admin.html`
- ملفات الواجهة:
  - `config.js`
  - `centers-data.js`
  - `script.js`
  - `welcome.js`
  - `admin.js`
- الباك إند:
  - `api/`

### ما الذي يعمل على Azure؟

- `GET /api/public/bootstrap`
  - يجلب الموظفين المسموحين وحالات الدخول المفتوحة
- `POST /api/attendance/signin`
  - يسجل الدخول ويرفع صورة الدخول
- `POST /api/attendance/signout`
  - يسجل الخروج ويرفع صورة الخروج
- `POST /api/auth/login`
  - يتحقق من كلمة مرور الأدمن
- `GET /api/admin/bootstrap`
  - يجلب سجلات الأدمن والموظفين والإعدادات وسجل التعديلات
- `POST /api/admin/employees`
  - إضافة أو تعديل موظف
- `DELETE /api/admin/employees?id=<employeeId>`
  - حذف موظف
- `POST /api/admin/settings`
  - حفظ إعدادات الحضور

### متغيرات البيئة المطلوبة

أضف هذه القيم داخل Azure Static Web Apps في:

`Settings` → `Environment variables`

- `AZURE_STORAGE_CONNECTION_STRING`
- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`
- `PHOTOS_CONTAINER_NAME`

قيم اختيارية لو أردت تخصيص أسماء الجداول:

- `ATTENDANCE_TABLE_NAME`
- `EMPLOYEES_TABLE_NAME`
- `SETTINGS_TABLE_NAME`
- `AUDIT_LOG_TABLE_NAME`

### تشغيل محلي اختياري

1. انسخ الملف:
   - `api/local.settings.sample.json`
2. وسمّه:
   - `api/local.settings.json`
3. ضع القيم الحقيقية بدل القيم التجريبية
4. افتح Terminal داخل:
   - `api/`
5. شغل:

```powershell
npm install
func start
```

---

## خطوات الرفع على Azure بالتفصيل

### 1. ارفع المشروع على GitHub

ارفع مجلد `centers` بالكامل إلى Repository على GitHub.

المهم أن يحتوي الريبو على:

- ملفات الواجهة في الجذر
- مجلد `api`
- الملف `staticwebapp.config.json`

### 2. افتح Azure Portal

ادخل إلى:

[https://portal.azure.com](https://portal.azure.com)

ثم سجل الدخول بحساب Azure.

### 3. أنشئ Resource Group

1. من البحث اكتب `Resource groups`
2. اضغط `Create`
3. اختر:
   - `Subscription`: اختر الاشتراك الخاص بك
   - `Resource group`: اكتب اسمًا مثل `centers-rg`
   - `Region`: اختر أقرب منطقة مناسبة
4. اضغط `Review + create`
5. ثم `Create`

### 4. أنشئ Storage Account

1. من البحث اكتب `Storage accounts`
2. اضغط `Create`
3. اختر:
   - `Subscription`: نفس الاشتراك
   - `Resource group`: اختر `centers-rg`
   - `Storage account name`: مثل `centersstorage123`
   - `Region`: نفس المنطقة
   - `Primary service`: `Azure Blob Storage or Azure Data Lake Storage Gen 2`
   - `Performance`: `Standard`
   - `Redundancy`: `Locally-redundant storage (LRS)`
4. اضغط `Review`
5. ثم `Create`

### 5. انسخ Connection String

بعد إنشاء الـ Storage Account:

1. افتحه
2. من القائمة الجانبية افتح:
   - `Security + networking`
   - ثم `Access keys`
3. انسخ قيمة:
   - `Connection string`

ستحتاجها بعد قليل في Environment Variables.

### 6. أنشئ Static Web App

1. من البحث اكتب `Static Web Apps`
2. اضغط `Create`
3. أدخل القيم التالية:
   - `Subscription`: نفس الاشتراك
   - `Resource group`: `centers-rg`
   - `Name`: مثل `centers-attendance`
   - `Plan type`: اختر الخطة المناسبة لك
   - `Region`: اختر نفس المنطقة أو أقرب منطقة مدعومة
4. في قسم `Deployment details` اختر:
   - `Source`: `GitHub`
5. اعمل `Sign in with GitHub` لو طلب منك
6. اختر:
   - `Organization`: حسابك أو المؤسسة
   - `Repository`: الريبو الذي رفعت عليه المشروع
   - `Branch`: غالبًا `main`

### 7. إعدادات Build داخل Static Web App

في قسم إعدادات البناء اختر بالضبط:

- `Build Presets`: `Custom`
- `App location`: `/`
- `Api location`: `api`
- `Output location`: `/`

ثم اضغط:

- `Review + create`
- ثم `Create`

### 8. انتظر إنشاء GitHub Actions

Azure سينشئ Workflow تلقائيًا داخل GitHub للنشر.

أي `push` جديد على الفرع المتصل سيعيد نشر:

- الواجهة من `/`
- الباك إند من `api`

### 9. أضف Environment Variables

بعد إنشاء الـ Static Web App:

1. افتحه من Azure Portal
2. من القائمة الجانبية اختر:
   - `Settings`
   - `Environment variables`
3. أضف القيم التالية:

- `AZURE_STORAGE_CONNECTION_STRING`
  - الصق هنا الـ Connection String الذي نسخته من Storage Account
- `ADMIN_PASSWORD`
  - ضع كلمة مرور الأدمن التي تريدها
- `ADMIN_JWT_SECRET`
  - ضع قيمة طويلة وعشوائية قوية
- `PHOTOS_CONTAINER_NAME`
  - استخدم مثلًا: `attendance-photos`

إذا أردت يمكنك أيضًا إضافة:

- `ATTENDANCE_TABLE_NAME=attendance`
- `EMPLOYEES_TABLE_NAME=employees`
- `SETTINGS_TABLE_NAME=settings`
- `AUDIT_LOG_TABLE_NAME=auditLog`

### 10. أعد النشر بعد إضافة المتغيرات

بعد حفظ Environment Variables:

- إما تعمل `Redeploy` من Azure إن كان متاحًا
- أو تعمل تعديل بسيط في GitHub ثم `push`

مثال سريع:

```powershell
git add .
git commit -m "azure deployment setup"
git push
```

### 11. اختبر الـ API

بعد اكتمال النشر افتح رابط الموقع، ثم افتح:

`https://YOUR-SITE-URL/api/health`

المفروض يرجع Response نجاح.

### 12. اختبر الموقع

اختبر الخطوات التالية:

1. افتح الصفحة الرئيسية
2. جرّب `Sign In`
3. جرّب `Sign Out`
4. افتح:
   - `/admin.html`
5. سجّل دخول الأدمن
6. تأكد من:
   - ظهور السجلات
   - ظهور الصور
   - عمل التقارير الشهرية
   - عمل إدارة الموظفين
   - حفظ الإعدادات
   - عمل `Export to Excel`

### 13. ملاحظات مهمة

- لا تحتاج Google Sheets أو Google Apps Script بعد تشغيل Azure backend
- ملف `apps-script-backend.gs` أصبح قديمًا وغير مطلوب لهذا المسار
- الصور لا تحتاج أن يكون الـ Blob Container عامًا، لأن الباك إند يولد روابط قراءة مؤقتة
- كلمة مرور الأدمن لم تعد موجودة في الواجهة الأمامية، بل في Environment Variables داخل Azure
- جلسة الأدمن أصبحت Cookie من الباك إند، ولا يعتمد المشروع على `localStorage` لحفظ بيانات التشغيل الأساسية

---

## English

### Is the project ready for Azure deployment?

Yes. The current project is prepared to run on:

- `Azure Static Web Apps` for the frontend
- `Azure Functions` for the backend API
- `Azure Table Storage` for attendance records, employees, settings, and audit log
- `Azure Blob Storage` for sign-in and sign-out photos

### Project structure

- Frontend pages in the repo root:
  - `index.html`
  - `welcome.html`
  - `admin.html`
- Frontend scripts:
  - `config.js`
  - `centers-data.js`
  - `script.js`
  - `welcome.js`
  - `admin.js`
- Backend API:
  - `api/`

### What runs on Azure?

- `GET /api/public/bootstrap`
  - Returns active employees and currently open sign-ins
- `POST /api/attendance/signin`
  - Creates a sign-in record and uploads the sign-in photo
- `POST /api/attendance/signout`
  - Completes the latest open record and uploads the sign-out photo
- `POST /api/auth/login`
  - Validates the admin password
- `GET /api/admin/bootstrap`
  - Returns admin records, employees, settings, and audit log
- `POST /api/admin/employees`
  - Creates or updates an employee
- `DELETE /api/admin/employees?id=<employeeId>`
  - Deletes an employee
- `POST /api/admin/settings`
  - Saves attendance settings

### Required environment variables

Add these in Azure Static Web Apps under:

`Settings` → `Environment variables`

- `AZURE_STORAGE_CONNECTION_STRING`
- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`
- `PHOTOS_CONTAINER_NAME`

Optional table-name overrides:

- `ATTENDANCE_TABLE_NAME`
- `EMPLOYEES_TABLE_NAME`
- `SETTINGS_TABLE_NAME`
- `AUDIT_LOG_TABLE_NAME`

### Optional local setup

1. Copy:
   - `api/local.settings.sample.json`
2. Rename it to:
   - `api/local.settings.json`
3. Fill in the real values
4. Open a terminal in:
   - `api/`
5. Run:

```powershell
npm install
func start
```

---

## Exact Azure deployment steps

### 1. Push the project to GitHub

Push the entire `centers` folder to a GitHub repository.

Make sure the repo contains:

- frontend files in the root
- the `api` folder
- `staticwebapp.config.json`

### 2. Open Azure Portal

Go to:

[https://portal.azure.com](https://portal.azure.com)

Then sign in with your Azure account.

### 3. Create a Resource Group

1. Search for `Resource groups`
2. Click `Create`
3. Fill in:
   - `Subscription`: your Azure subscription
   - `Resource group`: for example `centers-rg`
   - `Region`: your preferred region
4. Click `Review + create`
5. Click `Create`

### 4. Create a Storage Account

1. Search for `Storage accounts`
2. Click `Create`
3. Fill in:
   - `Subscription`: same subscription
   - `Resource group`: `centers-rg`
   - `Storage account name`: for example `centersstorage123`
   - `Region`: same region
   - `Primary service`: `Azure Blob Storage or Azure Data Lake Storage Gen 2`
   - `Performance`: `Standard`
   - `Redundancy`: `Locally-redundant storage (LRS)`
4. Click `Review`
5. Click `Create`

### 5. Copy the connection string

After the Storage Account is created:

1. Open it
2. In the left menu go to:
   - `Security + networking`
   - then `Access keys`
3. Copy the:
   - `Connection string`

You will use it in the next step.

### 6. Create a Static Web App

1. Search for `Static Web Apps`
2. Click `Create`
3. Fill in:
   - `Subscription`: same subscription
   - `Resource group`: `centers-rg`
   - `Name`: for example `centers-attendance`
   - `Plan type`: choose the plan you want
   - `Region`: same or closest supported region
4. In `Deployment details` choose:
   - `Source`: `GitHub`
5. Sign in to GitHub if Azure asks you to
6. Select:
   - `Organization`: your account or org
   - `Repository`: the repo that contains this project
   - `Branch`: usually `main`

### 7. Build settings for Static Web App

Set these values exactly:

- `Build Presets`: `Custom`
- `App location`: `/`
- `Api location`: `api`
- `Output location`: `/`

Then click:

- `Review + create`
- then `Create`

### 8. Wait for Azure to create GitHub Actions

Azure will automatically create a GitHub Actions workflow for deployment.

Every new `push` to the connected branch will redeploy:

- the frontend from `/`
- the backend from `api`

### 9. Add environment variables

After the Static Web App is created:

1. Open it in Azure Portal
2. In the left menu go to:
   - `Settings`
   - `Environment variables`
3. Add these values:

- `AZURE_STORAGE_CONNECTION_STRING`
  - paste the connection string from the Storage Account
- `ADMIN_PASSWORD`
  - set your admin password
- `ADMIN_JWT_SECRET`
  - set a long random secret
- `PHOTOS_CONTAINER_NAME`
  - for example: `attendance-photos`

You can also add:

- `ATTENDANCE_TABLE_NAME=attendance`
- `EMPLOYEES_TABLE_NAME=employees`
- `SETTINGS_TABLE_NAME=settings`
- `AUDIT_LOG_TABLE_NAME=auditLog`

### 10. Redeploy after saving environment variables

After saving the environment variables:

- either use `Redeploy` from Azure if available
- or make a small change in GitHub and `push` again

Example:

```powershell
git add .
git commit -m "azure deployment setup"
git push
```

### 11. Test the API

After deployment finishes, open:

`https://YOUR-SITE-URL/api/health`

It should return a healthy response.

### 12. Test the website

Run this checklist:

1. Open the main page
2. Test `Sign In`
3. Test `Sign Out`
4. Open:
   - `/admin.html`
5. Log in with your admin password
6. Confirm:
   - records load
   - photos load
   - monthly reports work
   - employee management works
   - settings save correctly
   - `Export to Excel` works

### 13. Important notes

- You no longer need Google Sheets or Google Apps Script once Azure backend is active
- `apps-script-backend.gs` is now legacy and is not required for the Azure path
- The photo container does not need to be public because the backend generates temporary read URLs
- The admin password is no longer stored in frontend code; it is stored in Azure environment variables
- Admin authentication now uses a backend session cookie, and the project no longer depends on `localStorage` for core runtime data
