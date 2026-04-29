const defaultEmployeeProfiles = [
  { id: "kamal", username: "kamal", fullName: "Kamal", active: true },
  { id: "ma.haitham", username: "ma.haitham", fullName: "محمود هيثم عبد الجيد", active: true },
  { id: "mo.ahmed", username: "mo.ahmed", fullName: "محمد احمد شكري", active: true },
  { id: "h.tarek", username: "h.tarek", fullName: "هاجر طارق محمد صلاح", active: true },
  { id: "sh.sabry", username: "sh.sabry", fullName: "شادية صبري حسنين", active: true },
  { id: "me.ahmed", username: "me.ahmed", fullName: "منة احمد عبد الرحمن", active: true },
  { id: "d.mohamed", username: "d.mohamed", fullName: "دعاء محمد فاروق", active: true },
  { id: "r.saeed", username: "r.saeed", fullName: "رحمة سعيد سلام", active: true },
  { id: "t.mahmoud", username: "t.mahmoud", fullName: "تقي محمود مصطفى", active: true },
  { id: "a.maher.1", username: "a.maher", fullName: "عبدالرحمن ماهر طه", active: true },
  { id: "s.mohamed", username: "s.mohamed", fullName: "سندس محمد احمد", active: true },
  { id: "w.mohamed.1", username: "w.mohamed", fullName: "وردة محمد حنفي", active: true },
  { id: "h.esam", username: "h.esam", fullName: "هاجر عصام محمد حسن", active: true },
  { id: "a.maher.2", username: "a.maher", fullName: "احمد ماهر سيد عبد الستار", active: true },
  { id: "y.mostafa", username: "y.mostafa", fullName: "يوسف مصطفي عبد الجواد", active: true },
  { id: "a.salah", username: "a.salah", fullName: "عبد الرحمن صلاح صوفي محمد", active: true },
  { id: "n.saeed", username: "n.saeed", fullName: "ندي سعيد عبد الفتاح", active: true },
  { id: "y.mohamed", username: "y.mohamed", fullName: "ياسر محمد فوزي محمود", active: true },
  { id: "w.mohamed.2", username: "w.mohamed", fullName: "وئام محمد مجدى محمود", active: true },
  { id: "d.gamal", username: "d.gamal", fullName: "دارين جمال محمد عبدالفتاح", active: true },
  { id: "sh.wael", username: "sh.wael", fullName: "شهد وائل", active: true },
  { id: "m.farag", username: "m.farag", fullName: "مصطفي فرج عبدالرحيم حسين", active: true }
]

const defaultWorkSettings = {
  workdayStartTime: "09:00",
  workdayEndTime: "17:00",
  lateGraceMinutes: 15
}

module.exports = {
  defaultEmployeeProfiles,
  defaultWorkSettings
}
