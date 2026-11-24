# ADR 0001 — Stack kỹ thuật ban đầu

Trạng thái: Chấp nhận (G0)

## Bối cảnh
GDD 3.1 trang 17 và Phụ lục D chọn single codebase React + TypeScript strict + Vite, Canvas 2D, sau đó Electron (Steam) và Capacitor (mobile). Repo bắt đầu trống.

## Quyết định
- React 19, TypeScript 6.0 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vite 8, Vitest 5, ESLint 10 + typescript-eslint.
- TypeScript giữ ở 6.0.x vì typescript-eslint hiện chỉ hỗ trợ `<6.1`.
- Chưa thêm Tailwind, Lucide, Zustand, Electron, Capacitor: thêm khi tới epic cần (TD-02 renderer/UI, TD-08 release) để tránh dependency chưa dùng.
- Engine nằm trong `src/engine/` là TypeScript thuần, không phụ thuộc React/DOM, để chạy được trong test, simulation và (P1+) server.

## Hệ quả
Có thể chạy `typecheck`, `lint`, `test`, `build` ngay. Các lệnh `test:e2e`, `simulate:economy`, `electron:*`, `cap:sync` sẽ được bổ sung theo lộ trình.
