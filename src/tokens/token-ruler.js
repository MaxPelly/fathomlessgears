const SPEED_COLOR = {
	withinSingle: "#1a4e9d",
	withinDouble: "#0e880e",
	beyond: "#8c1818"
};

/**
 * Colours the token movement ruler by how a waypoint's movement cost compares to the
 * token actor's speed: at or under 1x speed is blue, up to 2x is green, and anything
 * beyond that is red. Replaces the old Elevation Ruler integration (that module has no
 * v14 release and dropped the speed-highlighting API this system used to configure).
 * @extends {foundry.canvas.placeables.tokens.TokenRuler}
 */
export class HLMTokenRuler extends foundry.canvas.placeables.tokens.TokenRuler {
	_getGridHighlightStyle(waypoint, offset) {
		const style = super._getGridHighlightStyle(waypoint, offset);
		style.color = this._speedColor(waypoint);
		return style;
	}

	_getSegmentStyle(waypoint) {
		const style = super._getSegmentStyle(waypoint);
		style.color = this._speedColor(waypoint);
		return style;
	}

	_speedColor(waypoint) {
		const speed = this.token.actor?.system?.attributes?.speed?.total ?? 0;
		const cost = waypoint.measurement.cost;

		if (cost <= speed) return SPEED_COLOR.withinSingle;
		if (cost <= speed * 2) return SPEED_COLOR.withinDouble;
		return SPEED_COLOR.beyond;
	}
}
