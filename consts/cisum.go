package consts

// Cisum fork identification.
// CisumVersion is the version of the Cisum fork (independent from the upstream Navidrome version).
const (
	CisumVersion = "0.11.1"
	CisumName    = "Cisum"
	// SubsonicServerType is reported as "type" in Subsonic responses. It stays "navidrome" on purpose:
	// Subsonic apps (Symfonium, Tempo...) use it to enable Navidrome-specific features Cisum supports.
	SubsonicServerType = "navidrome"
	// URLPathWebUI is where the new Cisum web player is served. The classic UI stays at URLPathUI.
	URLPathWebUI = "/web"
)
