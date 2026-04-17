# CiviTrack - Planning Approval Management System

A production-ready React + Vite application for managing planning permit approvals in Kelaniya Pradeshiya Sabha. Handles Building Permits and Land Subdivision approvals, with boundary wall requests captured via permit selections in the application workflow.

## Quick Start

```bash
cd civitrack-react
npm install
npm run dev
```

Navigate to `http://localhost:5173/login`, select a role, and explore.

## Tech Stack

- **Framework**: React 19 + Vite 7
- **Styling**: Tailwind CSS 3
- **Routing**: React Router DOM v7
- **Icons**: Lucide React
- **State**: React Context API

## Key Features

### Authentication
- Demo role switcher (Applicant, Planning Officer, Technical Officer, Superintendent, Committee)
- Role-based sidebar navigation and page access

### Applicant Features
- **Dashboard**: Stats cards and recent activity
- **Application Wizard**: 5-step form for building/subdivision applications with boundary wall permit selection support
- **File Upload**: Drag-and-drop document submission
- **Application Tracking**: View status with color-coded badges
- **COC Requests**: Submit Certificate of Conformity
- **Profile**: Update personal information

### Staff Features
- **Planning Officer**: Application queue and task assignment
- **Technical Officer**: Site inspections and reports
- **Superintendent**: Review and endorse reports
- **Planning Committee**: Final approval decisions

### Public Pages
- **Landing**: Hero, stats, portal links
- **Guidelines**: Permit requirements, fees, timelines

## Project Structure

```
src/
├── layouts/          (DashboardLayout, PublicLayout)
├── pages/
│   ├── public/       (Landing, Info)
│   ├── auth/         (Login)
│   ├── applicant/    (Dashboard, NewApplication, Applications, CocRequests, Profile)
│   └── staff/        (Role-specific dashboards)
├── components/
│   ├── ui/           (Button, Modal, Card, Input, StatusBadge)
│   ├── forms/        (ApplicationWizard, FileUpload)
│   └── layout/       (Sidebar, Header)
├── context/          (AuthContext)
├── App.jsx           (Routes)
└── main.jsx          (Entry point)
```

## UI Components

**Button**: `<Button variant="primary" size="md">Click</Button>`

**Modal**: `<Modal open={open} onClose={toggle} title="Title">`

**StatusBadge**: `<StatusBadge status="approved">Approved</StatusBadge>`

**FileUpload**: `<FileUpload accept=".pdf" multiple files={files} onFilesSelect={setFiles} />`

**Input/Textarea**: `<Input label="Name" />` and `<Textarea label="Address" rows={4} />`

## Build & Deploy

```bash
# Production build
npm run build

# Preview
npm run preview

# Deploy to Vercel
vercel
```

## Next Steps

- Connect real backend API
- Add authentication & persistence
- Implement payment processing
- Add email notifications
- Create database models

## License

© 2025 Kelaniya Pradeshiya Sabha
