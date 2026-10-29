# TK_Tools

현장 업무용 소형 웹 도구 모음입니다. GitHub Pages로 배포되며, 설치나 서버 없이 폰 브라우저에서 바로 사용합니다.

| 도구 | 설명 | 주소 (GitHub Pages 활성화 후) |
|------|------|------|
| **QR Patrol** (`qr-patrol/`) | 하우스키핑 순찰용 **오프라인 QR 점검 앱(PWA)** | `https://kimlin70-spec.github.io/TK_Tools/qr-patrol/` |

---

# QR Patrol – 오프라인 QR 순찰 앱

발전소 내 각 장소에 붙인 QR 라벨을 폰으로 스캔하여 하루 1~2회 점검 결과(OK / Action needed)를 기록하는 아주 단순한 앱입니다.

- **완전 오프라인 동작**: 사무실 와이파이에서 한 번 열어 홈 화면에 추가하면, 이후 인터넷 없이 현장에서 사용합니다.
- **로그인·사용자 ID·근무조·수치 입력 없음**. 관리자 1명, 안드로이드폰 1대 기준.
- **모든 데이터는 폰 내부(IndexedDB)에만 저장**됩니다. 서버로 전송되는 것은 없습니다. → 정기 백업 필수(아래 참고).
- 앱 화면(UI)은 영어입니다.

## 주요 기능

| 화면 | 기능 |
|------|------|
| **Home** | 오늘 점검할 장소 목록과 상태(오전/오후 완료·미완료·누락), 미조치 목록(Open actions), 진행률 |
| **Scan** | 카메라로 QR 스캔 → 장소명 표시 → **OK / Action needed** 큰 버튼. 짧은 메모·사진(압축 저장)은 선택 사항. 라벨이 손상된 경우 "Can't scan? Select place"로 수동 선택(기록에 `manual` 표시) |
| **후속 확인** | 그 장소에 미완료 "Action needed"가 있으면, 이전 메모·사진을 먼저 보여주고 **Done / Not yet**을 선택한 뒤 평소 점검(OK / Action needed)을 진행 |
| **History** | 날짜별 기록(◀ ▶ 이동, 달력 선택), 장소별 필터, 후속 확인 이력, **누락된 점검(Missed checks)** 표시. 기록을 누르면 상세·사진·삭제. 맨 아래 **Daily report (PDF)** 버튼으로 그날 보고서 생성 |
| **Settings → Places** | 장소 추가/수정/삭제(장소명, 구역, 점검 주기: 하루 1회 또는 2회). 하루 2회는 **오전(12시 전)·오후(12시 후)** 회차로 구분. 삭제한 장소는 복원 가능 |
| **Settings → QR labels** | 장소마다 QR 1개(내용은 장소 ID만). A4 한 장에 6/8/15개 배치 미리보기, **인쇄 / PDF 저장(시스템 대화상자)**, **PDF 파일 다운로드**, **PDF 공유** |
| **Settings → Reports, Excel & backup** | 기간별 **PDF 보고서**(기록·메모·사진·누락·미조치), 엑셀 내보내기(기록 + 미조치 + 누락 시트), 전체 데이터 **백업 파일(.json) 저장/공유**, **복원** |
| **Settings** | 근무 요일(누락 계산에 사용, 기본 월~금), 앱 설치 버튼, 업데이트 확인, **샘플 장소 불러오기**, **전체 초기화(Reset all data)** |

처음 실행하면 테스트용 **샘플 장소 12개**가 자동으로 들어 있습니다. 실제 사용 전에 `Settings → Reset all data`로 모두 지운 뒤 실제 장소를 등록하세요.

---

## 1. GitHub Pages 켜는 법 (최초 1회)

> **먼저 확인: 저장소가 공개(Public)여야 합니다.**
> 무료 계정에서는 GitHub Pages를 공개 저장소에서만 쓸 수 있습니다. 비공개(Private) 저장소에서 Pages를 켜려 하면 "업그레이드(Pro)" 안내가 나옵니다.
> 공개로 바꾸는 방법: **Settings → General → 맨 아래 Danger Zone → Change repository visibility → Change to public** → 저장소 이름을 입력해 확인.
> 이 저장소에는 앱 코드만 있고 순찰 기록·장소 데이터는 폰 안에만 저장되므로, 공개해도 업무 데이터가 노출되지 않습니다. (QR에도 무작위 ID만 들어 있습니다.)

1. GitHub에서 이 저장소(`kimlin70-spec/TK_Tools`)를 엽니다.
2. 상단 **Settings** 탭 → 왼쪽 메뉴 **Pages**.
3. **Build and deployment** 에서
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`, 폴더: `/ (root)` → **Save**
4. 1~2분 뒤 같은 화면 상단에 *"Your site is live at https://kimlin70-spec.github.io/TK_Tools/"* 가 표시됩니다.
5. 앱 주소는 **`https://kimlin70-spec.github.io/TK_Tools/qr-patrol/`** 입니다.
   (저장소 루트 주소로 들어가도 QR Patrol 링크가 있습니다.)

> 이후 `main` 브랜치에 커밋이 올라갈 때마다 자동으로 다시 배포됩니다(보통 1~2분).
> 배포 상태는 저장소의 **Actions** 탭 → `pages build and deployment`에서 확인할 수 있습니다.

## 2. 폰에 설치하는 법 (안드로이드 + Chrome)

반드시 **와이파이가 되는 곳(사무실)** 에서 진행합니다.

1. 폰의 **Chrome**으로 `https://kimlin70-spec.github.io/TK_Tools/qr-patrol/` 를 엽니다.
   (주소를 치기 번거로우면 PC에서 주소를 QR로 만들어 찍거나, 카카오톡 등으로 링크를 보내세요.)
2. 화면이 뜨면 잠시(10초 정도) 기다립니다. 이때 앱 파일 전체가 폰에 저장(캐시)됩니다.
3. 홈 화면에 추가:
   - 화면에 **"Install"** 배너가 보이면 누릅니다. 또는
   - Chrome 오른쪽 위 **⋮ 메뉴 → "홈 화면에 추가"** (또는 "앱 설치") → **추가**.
4. 홈 화면에 생긴 **QR Patrol** 아이콘으로 실행합니다. (주소창 없이 전체 화면으로 열립니다.)
5. **Scan** 탭을 한 번 눌러 **카메라 권한을 "허용"** 해 둡니다. (한 번 허용하면 계속 유지됩니다.)
6. **오프라인 확인**: 폰을 **비행기 모드**로 바꾸고 → 앱을 완전히 닫았다가 홈 화면 아이콘으로 다시 실행 → 정상적으로 열리고 스캔이 되면 설치 완료입니다.
7. 비행기 모드를 해제합니다.

> - Chrome의 **시크릿 모드**에서는 저장이 되지 않으니 일반 모드로 설치하세요.
> - 폰 저장공간 정리 앱이 "Chrome 사이트 데이터"를 지우면 기록이 사라질 수 있습니다. Chrome 사이트 데이터 삭제는 하지 말고, 백업을 생활화하세요.
> - 앱이 새 버전으로 바뀌면 와이파이에서 열었을 때 자동으로 받아오며, Home 화면 상단에 **"A new version is ready – Reload"** 가 표시됩니다.

## 3. 장소 등록 → QR 라벨 인쇄·부착

### 3-1. 장소 등록
1. 앱 **Settings → Places → + Add**.
2. **Place name**(장소명), **Area / zone**(구역), **Check frequency**(Once a day / Twice a day) 입력 → **Save**.
3. 장소마다 6자리 ID(예: `K7M2PQ`)가 자동 부여되며, 이 ID만 QR에 들어갑니다.
   장소명·구역·주기는 나중에 바꿔도 QR을 다시 붙일 필요가 없습니다.

### 3-2. 라벨 인쇄
1. **Settings → QR labels**.
2. **Label size** 선택 (Large 6개/장·QR 60mm, Medium 8개/장·QR 42mm, Small 15개/장·QR 30mm). 멀리서 찍거나 어두운 곳이면 Large 권장.
3. 인쇄할 장소를 체크(기본: 전체).
4. 다음 중 한 가지로 PDF를 만듭니다.
   - **Download PDF file** → 폰 다운로드 폴더에 저장 → 사무실 PC로 전송(이메일, 메신저, USB 등) → PC에서 인쇄
   - **Share PDF** → 바로 이메일/메신저로 PC에 보내기
   - **Print / Save as PDF (system dialog)** → 안드로이드 인쇄 화면에서 프린터 선택 또는 "PDF로 저장"
5. **인쇄 시 반드시 100% 배율(실제 크기)** 로 인쇄하세요. "페이지에 맞춤"을 쓰면 QR이 작아질 수 있습니다. (A4 세로)

### 3-3. 부착
- 점선을 따라 자른 뒤, **투명 테이프로 전체를 덮거나 코팅(라미네이팅)** 해서 붙입니다. 먼지·물기에 강해지고 오래 갑니다.
- 눈높이(1.2~1.6m), 조명이 있는 평평한 면, 스캔할 때 폰이 20~40cm 거리에서 QR 전체를 볼 수 있는 곳이 좋습니다.
- 금속 표면·곡면·진동이 심한 곳은 피하고, 구부러지지 않게 붙입니다.
- 라벨이 훼손되면 같은 장소를 다시 인쇄하면 됩니다(ID가 같으므로 기록은 그대로 이어집니다).

## 4. 매일 사용 흐름

1. **Home**에서 오늘 점검할 장소와 상태 확인 (AM ✓ / PM Not yet / Missed …).
2. 장소에 도착 → **Scan** → QR을 비춥니다 → 장소명이 뜹니다.
3. 이전에 **Action needed**로 남긴 미조치가 있으면 메모·사진이 먼저 뜹니다 → **Done**(조치 완료) 또는 **Not yet**(아직) 선택.
4. 이번 점검 결과 **OK** 또는 **Action needed** 를 누릅니다.
   - Action needed는 한 번 더 눌러 저장하며, 그 사이에 짧은 메모·사진을 넣을 수 있습니다(선택).
5. "Saved" 화면에서 **Scan next**로 다음 장소로 이동.
6. 하루 2회 장소는 **12시 이전 = AM**, **12시 이후 = PM** 으로 자동 구분됩니다.
7. **History**에서 날짜별 기록과 **누락(Missed)** 을 확인합니다. 누락은 Settings의 **근무 요일(Working days)** 에만 계산됩니다(기본 월~금, 주말 근무 시 토/일을 켜 주세요).

## 4-1. 일일 보고서 PDF (관리자 확인용)

하우스키퍼가 순찰을 마친 뒤 버튼 하나로 그날의 보고서를 만들고, 관리자는 폰이나 PC에서 PDF만 열어 보면 됩니다.

1. **History** 탭 → 날짜 확인(기본 오늘) → 맨 아래 **Daily report (PDF)** 카드.
2. **Include photos** 체크(기본 켜짐) → **Download PDF report**(다운로드 폴더에 저장) 또는 **Share PDF report**(바로 전송).
3. 보고서 내용: 요약(완료/누락/조치 필요/미조치 수), 시간순 기록(장소·결과·메모·**사진**), 후속 확인(Done / Not yet), 누락 점검, 현재 미조치 목록.
4. 여러 날을 한 번에 보려면 **Settings → Reports, Excel & backup → Period**에서 기간을 정하고 **PDF report**를 만듭니다(주간 보고용). 날짜마다 한 섹션씩 들어갑니다.

파일 크기는 하루치(사진 4~5장) 약 0.3~0.5MB, 일주일치 약 1~2MB입니다. 사진을 빼면 더 작아집니다.

## 4-2. 파일 보내기: 이메일 계정이 없는 공용폰에서

**Share** 버튼을 누르면 안드로이드 공유 화면이 뜨고, 그 폰에 설치된 앱만 보입니다. 계정이 전혀 없는 공용폰이라면 아래 방법 중 하나를 쓰면 됩니다.

| 방법 | 계정 필요 | 설명 |
|------|-----------|------|
| **Quick Share(퀵쉐어 / Nearby Share)** | 없음 | 공유 화면에서 Quick Share 선택 → 가까이 있는 **관리자 폰**이나 **Quick Share 앱이 있는 Windows PC**로 바로 전송. 사무실에서 매일 넘기기에 가장 간단합니다. 받는 쪽은 설정에서 "모든 사람에게 공개"로 잠깐 켜 두면 됩니다 |
| **블루투스** | 없음 | 공유 화면에서 Bluetooth 선택 → 페어링된 폰/PC로 전송 |
| **USB 케이블** | 없음 | 폰을 사무실 PC에 연결 → 내부 저장소 **Download** 폴더에서 `patrol-report_날짜.pdf` 복사 |
| **사무실 와이파이 프린터** | 없음 | PDF를 열고 인쇄, 또는 QR labels 화면의 **Print** 버튼처럼 안드로이드 인쇄 기능으로 바로 출력(프린터가 와이파이 인쇄를 지원해야 함) |
| **전용 구글 계정 1개** | 공용 계정 | 사람 계정이 아니라 "순찰폰 계정"(예: `tk.patrol@gmail.com`)을 하나 만들어 폰에 로그인해 두면 **Gmail**로 관리자에게 보내거나 **Google Drive**에 자동 보관할 수 있습니다. 비밀번호는 관리자가 보관 |
| **카카오톡** | 전화번호 | 폰에 유심(전화번호)이 있어야 가입 가능. 업무용 계정으로 쓰면 공유 화면에서 바로 전송 |

권장: 관리자가 매일 같은 사무실에 있다면 **Quick Share로 관리자 폰에 전송**, 보관이 필요하면 **전용 구글 계정 + Drive**를 함께 쓰는 조합이 가장 손이 덜 갑니다. 백업 파일(.json)도 같은 방법으로 보내면 됩니다.

## 5. 데이터 백업 / 복원 / 엑셀

데이터는 **폰 안에만** 있습니다. 폰 분실·초기화·교체에 대비해 **주 1회 이상 백업**하세요. 7일 이상 백업이 없으면 Home 화면에 노란 안내가 뜹니다.

### 백업 (권장: 매주 금요일 사무실에서)
1. **Settings → Reports, Excel & backup → Backup**.
2. **Download backup (.json)** → 폰의 다운로드 폴더에 `qr-patrol_backup_날짜.json` 저장
   또는 **Share backup** → 이메일/메신저/클라우드로 사무실 PC에 보관.
3. 백업 파일 하나에 장소 + 기록 + 사진 + 설정이 모두 들어 있습니다.

### 복원 (새 폰 또는 초기화 후)
1. 새 폰에 앱을 설치합니다(2번 참고).
2. 백업 파일(.json)을 새 폰으로 옮깁니다(이메일 첨부 다운로드 등).
3. **Settings → Reports, Excel & backup → Restore → Choose backup file…** → 파일 선택 → **Restore**.
   ※ 복원하면 폰에 있던 기존 데이터는 모두 백업 내용으로 **대체**됩니다.

### 엑셀 내보내기 (보고용)
1. **Settings → Reports, Excel & backup → Period** 에서 기간(From / To) 선택.
2. **Download Excel (.xlsx)** 또는 **Share Excel**.
3. 시트 구성: **Records**(모든 기록), **Open actions**(현재 미조치 목록), **Missed checks**(기간 내 누락 점검).

## 6. 앱 수정·업데이트 (관리자용)

- 코드는 전부 정적 파일입니다: `qr-patrol/index.html`, `styles.css`, `js/*.js`, `sw.js`, `manifest.json`, `lib/`(오프라인용 라이브러리), `icons/`.
- 파일을 수정해 `main`에 푸시하면 Pages가 자동 재배포됩니다.
- **수정 후에는 반드시 `qr-patrol/sw.js` 맨 위의 `APP_VERSION` 값을 올리세요** (예: `1.0.0` → `1.0.1`). 이 값이 바뀌어야 설치된 폰이 새 파일을 받습니다. `js/app.js`의 `APP_VERSION`도 같이 맞춰 주면 Settings 화면에 표시되는 버전이 일치합니다.
- 폰에서는 와이파이 상태로 앱을 열면(또는 Settings → **Check for update**) 새 버전을 받아 오고, Home의 **Reload** 배너를 누르면 적용됩니다.

## 7. 문제 해결

| 증상 | 조치 |
|------|------|
| 카메라가 안 켜짐 / 검은 화면 | 폰 설정 → 앱 → Chrome → 권한 → 카메라 **허용**. 설치형(홈 화면) 앱이면 "QR Patrol" 앱의 권한도 확인. 임시로 **Can't scan? Select place** 사용 |
| QR이 안 읽힘 | 라벨에 빛 반사(코팅 유리면) 또는 너무 가까움. 20~40cm 거리, 손전등(Torch 버튼) 사용. 라벨이 구겨졌으면 재인쇄 |
| 오프라인에서 앱이 안 열림 | 와이파이에서 다시 한 번 앱을 열어 10초 이상 기다린 뒤 홈 화면 아이콘으로 재실행. 시크릿 모드는 불가 |
| 모르는 QR을 찍음 ("This is not a patrol QR code") | 다른 장비의 QR입니다. 이 앱의 라벨만 인식합니다 |
| "No place with ID …" | 라벨은 있는데 앱에 장소가 없음(초기화/다른 폰). 백업을 복원하거나 장소를 다시 등록 후 라벨 재인쇄 |
| 기록이 모두 사라짐 | Chrome 사이트 데이터 삭제·폰 초기화가 원인. 최근 백업 파일로 복원 |
| 어제 날짜에 "Missed"가 많이 보임 | 근무하지 않은 요일이면 Settings → Working days에서 해당 요일을 끄세요 |

## 폴더 구조

```
TK_Tools/
├─ index.html              # 도구 목록(랜딩) 페이지
├─ .nojekyll               # GitHub Pages에서 Jekyll 처리 생략
├─ README.md
└─ qr-patrol/              # QR Patrol 앱 (PWA)
   ├─ index.html           # 앱 화면 틀
   ├─ styles.css           # 스타일 + A4 라벨 인쇄용 CSS
   ├─ manifest.json        # PWA 매니페스트(홈 화면 설치)
   ├─ sw.js                # 서비스 워커(오프라인 캐시) – APP_VERSION 관리
   ├─ js/
   │  ├─ util.js           # 날짜/포맷/파일 저장·공유 등 공용 함수
   │  ├─ db.js             # IndexedDB 저장소(장소/기록/사진/설정, 백업·복원)
   │  ├─ logic.js          # 회차(AM/PM)·완료·누락 판정 규칙
   │  ├─ scanner.js        # 카메라 QR 스캔(BarcodeDetector → jsQR 대체)
   │  ├─ labels.js         # QR 라벨 시트(HTML 인쇄용 + jsPDF PDF)
   │  ├─ export.js         # 엑셀 내보내기(SheetJS), 백업 파일
   │  ├─ report.js         # PDF 보고서(일일/기간, 사진 포함)
   │  └─ app.js            # 화면(라우팅, Home/Scan/Check/History/Settings…)
   ├─ lib/                 # 오프라인용 라이브러리(저장소에 포함): jsQR, qrcode-generator, jsPDF, SheetJS
   └─ icons/               # 앱 아이콘
```

## 라이선스

- 이 저장소의 앱 코드는 자유롭게 수정·사용할 수 있습니다.
- 포함된 외부 라이브러리의 라이선스는 `qr-patrol/lib/LICENSES.md`를 참고하세요 (jsQR: Apache-2.0, qrcode-generator: MIT, jsPDF: MIT, SheetJS CE: Apache-2.0).
