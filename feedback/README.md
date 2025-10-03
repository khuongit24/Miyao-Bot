# 📝 Feedback & Bug Report System

**Version:** 1.3.0  
**Last Updated:** October 3, 2025

---

## 📋 Overview

Miyao Bot includes a comprehensive feedback and bug reporting system that allows users to:
- 💡 Submit feature suggestions and general feedback
- 🐛 Report bugs with detailed reproduction steps
- 📊 Admin can view, manage, and track all submissions
- ✅ Mark bug reports as resolved

All feedback data is stored locally in JSON files for easy management and portability.

---

## 🎯 Features

### For Users:
- **Easy Submission** - Modal forms accessible via help command buttons
- **Validation** - Input validation prevents incomplete submissions
- **Rate Limiting** - Prevents spam (1 submission per minute)
- **Duplicate Detection** - Prevents identical bug reports within 5 minutes
- **Confirmation** - Receive unique ID for tracking your submission
- **Privacy** - All submissions are stored locally, not on external servers

### For Admins:
- **View All Submissions** - Paginated lists of feedbacks and bug reports
- **Detailed Views** - See full details of any submission by ID
- **Status Management** - Mark bug reports as resolved
- **Statistics** - View comprehensive stats (total, resolved, top contributors)
- **Export** - Data stored in easily readable JSON format

---

## 📂 File Structure

```
feedback/
├── feedbacks.json        # User feedback submissions
└── bug-reports.json      # Bug report submissions
```

### feedbacks.json Schema:
```json
{
  "id": 1,
  "type": "FEEDBACK",
  "timestamp": "2025-10-03T12:00:00.000Z",
  "user": {
    "id": "123456789",
    "tag": "User#1234",
    "username": "User"
  },
  "guild": {
    "id": "987654321",
    "name": "My Server"
  },
  "subject": "Feature Request",
  "content": "Please add playlist support!",
  "contact": "user@example.com"
}
```

### bug-reports.json Schema:
```json
{
  "id": 1,
  "type": "BUG_REPORT",
  "timestamp": "2025-10-03T12:00:00.000Z",
  "user": {
    "id": "123456789",
    "tag": "User#1234",
    "username": "User"
  },
  "guild": {
    "id": "987654321",
    "name": "My Server"
  },
  "title": "Bot disconnects on skip",
  "steps": "1. Join VC\n2. /play song\n3. /skip",
  "expected": "Should play next song",
  "actual": "Bot disconnects from VC",
  "contact": "user@example.com",
  "status": "OPEN",
  "severity": "MEDIUM"
}
```

---

## 🚀 Usage Guide

### For Users

#### Submitting Feedback:

1. Use `/help` command
2. Click **"Gửi góp ý"** (📧) button
3. Fill in the modal form:
   - **Tiêu đề** (Title) - Brief summary (5-100 chars)
   - **Nội dung góp ý** (Content) - Detailed feedback (10-1000 chars)
   - **Thông tin liên hệ** (Contact) - Optional contact info
4. Click **Submit**
5. You'll receive a confirmation with a unique Feedback ID

**Example Feedback:**
```
Tiêu đề: Thêm tính năng playlist
Nội dung: Bot hiện tại rất tốt nhưng thiếu tính năng lưu playlist. 
          Có thể thêm /playlist save và /playlist load không?
Liên hệ: myemail@example.com
```

#### Reporting Bugs:

1. Use `/help` command
2. Click **"Báo cáo lỗi"** (🐛) button
3. Fill in the modal form:
   - **Tên lỗi** (Bug Title) - Brief description (5-100 chars)
   - **Các bước tái hiện** (Steps to Reproduce) - How to reproduce (10-500 chars)
   - **Kết quả mong đợi** (Expected) - What should happen (5-200 chars)
   - **Kết quả thực tế** (Actual) - What actually happens (5-200 chars)
   - **Thông tin liên hệ** (Contact) - Optional contact info
4. Click **Submit**
5. You'll receive a confirmation with a unique Bug Report ID

**Example Bug Report:**
```
Tên lỗi: Bot disconnect khi skip bài
Các bước: 
  1. Vào voice channel
  2. /play một bài bất kỳ
  3. Đợi bài chơi
  4. /skip
Mong đợi: Bot phát bài tiếp theo trong queue
Thực tế: Bot bị disconnect khỏi voice channel
Liên hệ: discorduser#1234
```

#### Rate Limits:
- **Cooldown:** 1 minute between submissions
- **Duplicate Check:** Cannot submit identical bug within 5 minutes
- **Reason:** Prevents spam and duplicate reports

---

### For Admins

All admin commands require **Administrator** permission.

#### View Feedback List:
```
/feedback list [page]
```
Shows paginated list (5 per page) of all feedback submissions.

**Example Output:**
```
📝 Danh sách Feedbacks
Tổng: 15 feedbacks

#1 - Thêm tính năng playlist
👤 User#1234
🏢 My Server
📅 03/10/2025 12:00:00
📄 Bot hiện tại rất tốt nhưng thiếu...

Page 1/3
```

#### View Feedback Details:
```
/feedback view <id>
```
Shows full details of a specific feedback.

**Example Output:**
```
📝 Feedback #1

📌 Tiêu đề: Thêm tính năng playlist
👤 Người gửi: User#1234 (123456789)
🏢 Server: My Server
📅 Thời gian: 03/10/2025 12:00:00
📄 Nội dung: Bot hiện tại rất tốt nhưng thiếu tính năng lưu playlist...
📞 Liên hệ: myemail@example.com
```

#### View Bug Report List:
```
/feedback bugs [page]
```
Shows paginated list (5 per page) of all bug reports with status.

**Example Output:**
```
🐛 Danh sách Bug Reports
Tổng: 8 bug reports

🔴 #1 - Bot disconnect khi skip bài
👤 User#1234
🏢 My Server
📅 03/10/2025 12:00:00
📊 Status: OPEN

✅ #2 - Volume không hoạt động
👤 User#5678
🏢 Another Server
📅 02/10/2025 10:00:00
📊 Status: RESOLVED

Page 1/2
```

#### View Bug Report Details:
```
/feedback bug <id>
```
Shows full details of a specific bug report.

**Example Output:**
```
🔴 Bug Report #1

🐛 Tên lỗi: Bot disconnect khi skip bài
👤 Người báo cáo: User#1234 (123456789)
🏢 Server: My Server
📅 Thời gian: 03/10/2025 12:00:00
📊 Status: OPEN

📝 Các bước tái hiện:
1. Vào voice channel
2. /play một bài bất kỳ
3. /skip

✅ Kết quả mong đợi: Bot phát bài tiếp theo
❌ Kết quả thực tế: Bot disconnect

📞 Liên hệ: discorduser#1234
```

#### Mark Bug as Resolved:
```
/feedback resolve <id>
```
Marks a bug report as resolved and records who resolved it.

**Example Output:**
```
✅ Bug Report Resolved

Bug report #1 đã được đánh dấu là đã giải quyết!

🐛 Lỗi: Bot disconnect khi skip bài
👤 Resolved by: Admin#0001
📅 Resolved at: 03/10/2025 14:00:00
```

#### View Statistics:
```
/feedback stats
```
Shows comprehensive statistics about all submissions.

**Example Output:**
```
📊 Thống kê Feedback & Bug Reports

📝 Feedbacks: 15 feedbacks
🐛 Bug Reports: 8 reports
📈 Tổng: 23 items

🔴 Open Bugs: 3
✅ Resolved Bugs: 5
📊 Resolve Rate: 63%

📅 Khoảng thời gian: 01/09/2025 - 03/10/2025

🏆 Top Contributors:
User#1234: 7
TestUser#5678: 4
Helper#9999: 3
```

---

## 🔧 Configuration

### Rate Limiting

Edit `Core/events/helpHandler.js`:

```javascript
// Feedback cooldown (default: 60000ms = 1 minute)
if (timeSinceLastFeedback < 60000) { 
    // Change 60000 to desired milliseconds
}

// Bug report cooldown (default: 60000ms = 1 minute)
if (timeSinceLastBug < 60000) {
    // Change 60000 to desired milliseconds
}

// Duplicate detection window (default: 300000ms = 5 minutes)
const userRecentBugs = bugReports.filter(b => {
    const timeDiff = Date.now() - new Date(b.timestamp).getTime();
    return b.user.id === interaction.user.id && timeDiff < 300000;
    // Change 300000 to desired milliseconds
});
```

### Pagination

Edit `Core/commands/feedback.js`:

```javascript
// Items per page (default: 5)
const perPage = 5; // Change to desired number
```

### Validation Rules

Edit `Core/events/helpHandler.js`:

```javascript
// Feedback subject minimum length
if (!subject || subject.length < 5) { // Change 5 to desired length

// Feedback content minimum length
if (!content || content.length < 10) { // Change 10 to desired length

// Bug title minimum length
if (!title || title.length < 5) { // Change 5 to desired length

// Bug steps minimum length
if (!steps || steps.length < 10) { // Change 10 to desired length
```

---

## 📊 Data Management

### Backup Data

```powershell
# Windows
Copy-Item -Path "feedback\*" -Destination "backup\feedback-$(Get-Date -Format 'yyyyMMdd')" -Recurse

# Create backup directory first
New-Item -ItemType Directory -Path "backup\feedback-$(Get-Date -Format 'yyyyMMdd')"
```

```bash
# Linux/Mac
mkdir -p backup/feedback-$(date +%Y%m%d)
cp -r feedback/* backup/feedback-$(date +%Y%m%d)/
```

### Export to CSV

You can use a tool like `json2csv` or write a simple script:

```javascript
import fs from 'fs';

const feedbacks = JSON.parse(fs.readFileSync('feedback/feedbacks.json', 'utf8'));

let csv = 'ID,Date,User,Guild,Subject,Content,Contact\n';
for (const f of feedbacks) {
    csv += `${f.id},"${f.timestamp}","${f.user.tag}","${f.guild.name}","${f.subject}","${f.content}","${f.contact}"\n`;
}

fs.writeFileSync('feedbacks.csv', csv);
```

### Clear Old Data

```javascript
import fs from 'fs';

const feedbacks = JSON.parse(fs.readFileSync('feedback/feedbacks.json', 'utf8'));

// Keep only last 90 days
const cutoffDate = Date.now() - (90 * 24 * 60 * 60 * 1000);
const filtered = feedbacks.filter(f => new Date(f.timestamp).getTime() > cutoffDate);

fs.writeFileSync('feedback/feedbacks.json', JSON.stringify(filtered, null, 2));
```

---

## 🛡️ Security & Privacy

### Data Storage:
- ✅ All data stored **locally** on your server
- ✅ No external API calls or cloud storage
- ✅ Complete control over data retention
- ✅ Easy to backup and export

### User Information Collected:
- Discord User ID (for spam prevention)
- Discord Username & Tag (for identification)
- Guild ID & Name (for context)
- Optional contact info (user-provided)

### Privacy Best Practices:
1. **Inform Users:** Let users know data is stored locally
2. **GDPR Compliance:** Provide way to delete user data on request
3. **Access Control:** Only admins can view submissions
4. **Secure Storage:** Keep `feedback/` directory properly secured

### Delete User Data:

```javascript
// Script to delete all data from a specific user
import fs from 'fs';

const userId = '123456789'; // Replace with actual user ID

// Delete from feedbacks
let feedbacks = JSON.parse(fs.readFileSync('feedback/feedbacks.json', 'utf8'));
feedbacks = feedbacks.filter(f => f.user.id !== userId);
fs.writeFileSync('feedback/feedbacks.json', JSON.stringify(feedbacks, null, 2));

// Delete from bug reports
let bugs = JSON.parse(fs.readFileSync('feedback/bug-reports.json', 'utf8'));
bugs = bugs.filter(b => b.user.id !== userId);
fs.writeFileSync('feedback/bug-reports.json', JSON.stringify(bugs, null, 2));

console.log(`Deleted all data for user ${userId}`);
```

---

## 🐛 Troubleshooting

### "Rate limit exceeded" error:
**Cause:** User submitting too frequently  
**Solution:** Wait for cooldown period (default: 1 minute)

### "Failed to save feedback" error:
**Cause:** Filesystem permission or disk space issue  
**Solution:** 
1. Check `feedback/` directory exists
2. Verify write permissions
3. Check available disk space

### Feedback not appearing in list:
**Cause:** JSON parse error or corrupted file  
**Solution:**
1. Check JSON syntax in files
2. Validate with online JSON validator
3. Restore from backup if needed

### Modal not appearing:
**Cause:** Discord client issue or rate limiting  
**Solution:**
1. Wait a few seconds and try again
2. Restart Discord client
3. Check bot permissions

---

## 📈 Future Enhancements

Potential improvements for future versions:

- [ ] **Auto-notifications** - Notify admins in a dedicated channel
- [ ] **Email Integration** - Send email notifications for new submissions
- [ ] **Web Dashboard** - View and manage submissions via web interface
- [ ] **Priority System** - Add priority levels (Low, Medium, High, Critical)
- [ ] **Tagging** - Add tags/categories to submissions
- [ ] **Search** - Search submissions by keyword
- [ ] **Commenting** - Allow admins to add comments/notes
- [ ] **User Dashboard** - Let users view their own submissions
- [ ] **Voting** - Let users upvote popular feature requests

---

## 📞 Support

If you encounter issues with the feedback system:

1. **Check Logs:** Review `Miyao-error.log` for error messages
2. **Validate JSON:** Ensure JSON files are not corrupted
3. **GitHub Issues:** Report bugs at https://github.com/khuongit24/issues
4. **Discord Support:** Contact bot developer directly

---

## 📝 Changelog

### v1.3.0 (October 3, 2025)
- ✨ Initial release of feedback system
- ✅ User feedback submission modal
- ✅ Bug report submission modal
- ✅ Admin commands for viewing/managing submissions
- ✅ Rate limiting and spam prevention
- ✅ Duplicate detection
- ✅ Input validation
- ✅ Statistics dashboard
- ✅ Resolve bug report functionality

---

**🎉 Thank you for using Miyao Bot's Feedback System! Your feedback helps make the bot better for everyone.**

**Made with ❤️ by Miyao Team**  
**GitHub:** https://github.com/khuongit24
