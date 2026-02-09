# 🏠 Home Hub - Family Command Center

A unified dashboard for your household with weather, chores, dog treat tracking, and more.

## ✨ Features

- 🔐 **Secure Google Login** - Family authentication via Supabase
- 🌤️ **Smart Weather** - Multi-source weather with AI summaries
- ✅ **Chores Management** - Create, assign, and track household tasks
- 🐕 **Dog Treat Tracker** - Monitor your pets' calorie intake
- 📅 **Calendar Integration** - Google Calendar embed support
- 🖼️ **Photo Slideshow** - Immich integration for standby mode
- ⚙️ **Personal Settings** - Location, quiet hours, and more

## 🚀 Quick Start

1. **Deploy to Vercel**: Push to GitHub, Vercel auto-deploys
2. **Configure Supabase**: Run `database-setup.sql` in SQL Editor
3. **Add Family**: Insert emails into database tables
4. **Share URL**: Family signs in with Google

## 📚 Documentation

- **PRODUCTION_SETUP_GUIDE.md** - Complete setup instructions
- **QUICK_CHECKLIST.md** - Quick deployment reference
- **database-setup.sql** - Database schema and setup

## 🔧 Configuration

Edit `public/config.js` with your credentials:
- Supabase URL & Key (required)
- Firebase config (required for dog treats)
- Default location (already set to Gahanna, OH)

## 🔑 Required Services

✅ **Already Configured:**
- Supabase - Authentication & database
- Firebase - Dog treat tracker
- Location - Gahanna, Ohio

⚙️ **Optional Enhancements:**
- Weather API keys (add to Vercel env vars)
- Google Calendar embed URL (add in app settings)
- Immich photo server (add in app settings)

## 🐛 Troubleshooting

**Can't Login?** → Email must be in BOTH database tables  
**Weather Not Loading?** → Check location in Settings  
**Chores Not Saving?** → Verify Supabase RLS policies enabled

See PRODUCTION_SETUP_GUIDE.md for detailed help.

---

**Version**: 1.0 | **Deployed**: https://homehub-mu.vercel.app
