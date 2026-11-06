# Bücher-App einrichten

Du brauchst nur ein kostenloses GitHub-Konto. Die App speichert alles auf deinem Handy, es gibt kein Backend.

## 1. App veröffentlichen

1. Lege auf [github.com/new](https://github.com/new) ein neues Repository an, z. B. `buecher` (öffentlich).
2. Lade über **uploading an existing file** den **Inhalt** dieses Ordners hoch, also `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest` und den Ordner `icons` direkt in die oberste Ebene. `ANLEITUNG.md` musst du nicht hochladen.
3. Stelle unter **Settings > Pages** bei „Branch" `main` und `/ (root)` ein und speichere.
4. Nach etwa einer Minute läuft die App unter `https://schmidthorsten89-beep.github.io/buecher/`.

## 2. Auf dem Handy installieren

1. Öffne die Adresse in **Chrome** auf dem Android-Handy.
2. Wähle im Chrome-Menü **App installieren** bzw. **Zum Startbildschirm hinzufügen**.
3. Beim ersten Scannen fragt Chrome nach der Kamera – einmal erlauben.

## 3. So funktioniert's

- **+** fügt ein Buch hinzu: nach Titel, Autor oder ISBN suchen, den Strichcode auf der Rückseite scannen oder das Buch von Hand eintragen.
- **Lese ich** zeigt deine aktuellen Bücher. Mit **Seite eintragen** hältst du den Fortschritt fest, mit **✓ Fertig** bewertest du das Buch.
- **Bibliothek** zeigt alle Bücher, filterbar nach Merkliste, Lese ich, Gelesen und Abgebrochen.
- **Statistik** zeigt dein Leseziel, Bücher pro Monat und Highlights für jedes Jahr.
- Ein Tipp auf ein Buch öffnet Details mit Status, Bewertung, Daten, Notizen und Zitaten.
- Das **Leseziel** stellst du unter **⚙** ein.

## 4. Kindle-exklusive Bücher und E-Books

Bücher, die es nur bei Amazon gibt (Kindle Unlimited, KDP), haben meist keine ISBN und tauchen in der Suche nicht auf. So trägst du sie ein:

- **Teilen (am einfachsten):** Öffne das Buch in der Amazon-App, der Kindle-App oder in Chrome auf amazon.de, tippe auf **Teilen** und wähle **Bücher**. Das Formular öffnet sich mit Titel, Link und – wenn erkennbar – Autor und ASIN. Prüfe die Angaben, ergänze die Seitenzahl und speichere.
- **Von Hand:** **+ > Von Hand eintragen**, Format **E-Book** wählen. Die **ASIN** (z. B. `B0C1234XYZ`) steht auf der Amazon-Seite unter „Produktinformation". Mit ASIN versucht die App, das Cover selbst zu laden, und zeigt in den Details den Link **Bei Amazon ansehen**.
- **Cover:** Auf Amazon lange auf das Cover tippen > **Bildadresse kopieren** und ins Feld einfügen – oder **📷 Foto oder Screenshot** wählen. Einen Screenshot schneidest du am besten vorher in der Galerie auf das Cover zu.

Erscheint **Bücher** nicht im Teilen-Menü, war die App schon vor diesem Update installiert. Chrome aktualisiert das meist innerhalb eines Tages von selbst. Sonst: **erst Daten exportieren**, App deinstallieren, neu installieren, Daten importieren.

## Gut zu wissen

- **Sicherung:** Deine Bücher liegen nur auf diesem Handy. Exportiere unter **⚙ > Daten exportieren** ab und zu eine Sicherungsdatei, z. B. nach Google Drive. Mit **Daten importieren** holst du sie zurück oder überträgst sie auf ein neues Handy.
- **Chrome-Daten löschen** löscht auch deine Bücher. Vorher exportieren!
- **Tabelle:** **⚙ > Als Tabelle (CSV)** erzeugt eine Datei für Excel oder Google Sheets.
- **Buchdaten und Cover** kommen aus Google Books, ersatzweise aus Open Library. Findet die Suche nichts, trag das Buch von Hand ein.
- **Eigene Cover-Fotos** werden verkleinert im Handy-Speicher abgelegt (etwa 15 KB pro Foto). Ein paar Hundert passen hinein; meldet die App „Speicher voll", nimm bei einigen Büchern lieber die Bildadresse.
- **Änderung an den App-Dateien:** Erhöhe in `sw.js` die Nummer bei `CACHE` (aktuell `buecher-v3`, nächste `buecher-v4`) und lade die Dateien neu hoch.
- **Die App zeigt eine alte Version:** Chrome-Cache für die Seite leeren und die App neu öffnen.
